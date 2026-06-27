-- ============================================================================
-- DriftGrid Cloud — Phase 4: write_manifest() RPC (atomic cloud write)
-- ----------------------------------------------------------------------------
-- The cloud equivalent of the SQLite backend's single transaction. PostgREST /
-- supabase-js has NO client-side transactions, so the whole decompose →
-- upsert → prune must happen server-side in one call. A plpgsql function is
-- one transaction by definition, so this is atomic: a manifest write either
-- lands completely or not at all (no half-written trees — the corruption class
-- this whole effort kills). See PHASE-4-DESIGN.md.
--
-- Mirrors lib/sqlite-storage.ts:writeManifestDb exactly:
--   * iterate manifest.rounds[] (NEVER the concepts alias); wrap legacy
--     top-level concepts into round-1 when rounds is empty.
--   * keep a surrogate uuid id + the manifest's string id (manifest_id);
--     parent links resolved by natural key.
--   * `ord` preserves source array order; `extras` = the source object minus
--     the typed keys (lossless overflow).
--   * upsert by natural key, then prune children no longer present.
--
-- The app calls this via supabase.rpc('write_manifest', {...}); the PGlite test
-- (tests/postgres-storage.test.ts) calls it directly and asserts the read-back
-- manifest matches the SQLite backend byte-for-byte.
-- ============================================================================

create or replace function public.write_manifest(
  p_user    uuid,
  p_client  text,
  p_project text,
  p_manifest jsonb
) returns void
language plpgsql
as $$
declare
  v_project_id uuid;
  v_rounds     jsonb;
  v_round      jsonb;  v_round_id   uuid;  v_round_ord   int := 0;
  v_concept    jsonb;  v_concept_id uuid;  v_concept_ord int;
  v_version    jsonb;  v_version_id uuid;  v_version_ord int;
  v_ann        jsonb;  v_ann_id     uuid;  v_ann_ord     int;
  v_mid text;
  v_kept_rounds   uuid[] := '{}';
  v_kept_concepts uuid[];
  v_kept_versions uuid[];
  v_kept_anns     uuid[];
begin
  -- ---- project ----
  insert into public.projects (user_id, client_slug, project_slug, name, canvas, output, links, created, extras)
  values (
    p_user, p_client, p_project,
    coalesce(p_manifest#>>'{project,name}', ''),
    coalesce(p_manifest#>>'{project,canvas}', ''),
    p_manifest#>>'{project,output}',
    coalesce(p_manifest#>'{project,links}', '{}'::jsonb),
    p_manifest#>>'{project,created}',
    jsonb_build_object(
      'workingSets', coalesce(p_manifest->'workingSets', '[]'::jsonb),
      'documents',   p_manifest->'documents',
      'comments',    coalesce(p_manifest->'comments', '[]'::jsonb),
      'clientEdits', coalesce(p_manifest->'clientEdits', '[]'::jsonb)
    )
  )
  on conflict (user_id, client_slug, project_slug) do update set
    name=excluded.name, canvas=excluded.canvas, output=excluded.output,
    links=excluded.links, created=excluded.created, extras=excluded.extras, updated_at=now()
  returning id into v_project_id;

  -- ---- normalize rounds (wrap legacy top-level concepts into round-1) ----
  if p_manifest->'rounds' is not null and jsonb_array_length(p_manifest->'rounds') > 0 then
    v_rounds := p_manifest->'rounds';
  elsif p_manifest->'concepts' is not null and jsonb_array_length(p_manifest->'concepts') > 0 then
    v_rounds := jsonb_build_array(jsonb_build_object(
      'id', 'round-1', 'number', 1, 'name', 'Round 1',
      'createdAt', coalesce(p_manifest#>>'{project,created}', now()::text),
      'selects', '[]'::jsonb,
      'concepts', p_manifest->'concepts'
    ));
  else
    v_rounds := '[]'::jsonb;
  end if;

  for v_round in select * from jsonb_array_elements(v_rounds) loop
    v_mid := coalesce(v_round->>'id', 'round-' || coalesce(v_round->>'number', (v_round_ord + 1)::text));
    insert into public.rounds (project_id, manifest_id, ord, number, name, status, note, created, closed_at, selects, document_ids, summary_document_id, extras)
    values (
      v_project_id, v_mid, v_round_ord,
      coalesce((v_round->>'number')::int, 0),
      coalesce(v_round->>'name', ''),
      case when v_round->>'closedAt' is not null then 'closed' else 'open' end,
      v_round->>'note',
      v_round->>'createdAt',
      v_round->>'closedAt',
      coalesce(v_round->'selects', '[]'::jsonb),
      v_round->'documentIds',
      v_round->>'summaryDocumentId',
      (v_round - 'id' - 'number' - 'name' - 'createdAt' - 'closedAt' - 'note' - 'documentIds' - 'summaryDocumentId' - 'selects' - 'concepts')
    )
    on conflict (project_id, manifest_id) do update set
      ord=excluded.ord, number=excluded.number, name=excluded.name, status=excluded.status, note=excluded.note,
      created=excluded.created, closed_at=excluded.closed_at, selects=excluded.selects,
      document_ids=excluded.document_ids, summary_document_id=excluded.summary_document_id, extras=excluded.extras
    returning id into v_round_id;
    v_kept_rounds := array_append(v_kept_rounds, v_round_id);

    v_kept_concepts := '{}';
    v_concept_ord := 0;
    for v_concept in select * from jsonb_array_elements(coalesce(v_round->'concepts', '[]'::jsonb)) loop
      v_mid := coalesce(v_concept->>'id', 'concept-' || v_concept_ord::text);
      insert into public.concepts (round_id, manifest_id, ord, slug, label, description, position, visible, branched_from, canvas, extras)
      values (
        v_round_id, v_mid, v_concept_ord,
        v_concept->>'slug',
        coalesce(v_concept->>'label', ''),
        coalesce(v_concept->>'description', ''),
        coalesce((v_concept->>'position')::int, 0),
        coalesce((v_concept->>'visible')::boolean, true),
        v_concept->'branchedFrom',
        v_concept->'canvas',
        (v_concept - 'id' - 'slug' - 'label' - 'description' - 'position' - 'visible' - 'branchedFrom' - 'canvas' - 'versions')
      )
      on conflict (round_id, manifest_id) do update set
        ord=excluded.ord, slug=excluded.slug, label=excluded.label, description=excluded.description, position=excluded.position,
        visible=excluded.visible, branched_from=excluded.branched_from, canvas=excluded.canvas, extras=excluded.extras
      returning id into v_concept_id;
      v_kept_concepts := array_append(v_kept_concepts, v_concept_id);

      v_kept_versions := '{}';
      v_version_ord := 0;
      for v_version in select * from jsonb_array_elements(coalesce(v_concept->'versions', '[]'::jsonb)) loop
        v_mid := coalesce(v_version->>'id', 'v-' || v_version_ord::text);
        insert into public.versions (concept_id, manifest_id, ord, number, file_path, parent_id, changelog, visible, starred, thumbnail, created, extras)
        values (
          v_concept_id, v_mid, v_version_ord,
          coalesce((v_version->>'number')::int, 0),
          coalesce(v_version->>'file', ''),
          v_version->>'parentId',
          coalesce(v_version->>'changelog', ''),
          coalesce((v_version->>'visible')::boolean, true),
          coalesce((v_version->>'starred')::boolean, false),
          v_version->>'thumbnail',
          v_version->>'created',
          (v_version - 'id' - 'number' - 'file' - 'parentId' - 'changelog' - 'visible' - 'starred' - 'thumbnail' - 'created' - 'annotations')
        )
        on conflict (concept_id, manifest_id) do update set
          ord=excluded.ord, number=excluded.number, file_path=excluded.file_path, parent_id=excluded.parent_id, changelog=excluded.changelog,
          visible=excluded.visible, starred=excluded.starred, thumbnail=excluded.thumbnail, created=excluded.created, extras=excluded.extras
        returning id into v_version_id;
        v_kept_versions := array_append(v_kept_versions, v_version_id);

        v_kept_anns := '{}';
        v_ann_ord := 0;
        for v_ann in select * from jsonb_array_elements(coalesce(v_version->'annotations', '[]'::jsonb)) loop
          v_mid := coalesce(v_ann->>'id', 'a-' || v_ann_ord::text);
          insert into public.annotations (version_id, manifest_id, ord, x, y, element, body, author, is_client, is_agent, resolved, parent_id, status, submitted_at, attachments, provider, created, extras)
          values (
            v_version_id, v_mid, v_ann_ord,
            (v_ann->>'x')::double precision,
            (v_ann->>'y')::double precision,
            v_ann->>'element',
            coalesce(v_ann->>'text', ''),
            coalesce(v_ann->>'author', ''),
            coalesce((v_ann->>'isClient')::boolean, false),
            coalesce((v_ann->>'isAgent')::boolean, false),
            coalesce((v_ann->>'resolved')::boolean, false),
            v_ann->>'parentId',
            v_ann->>'status',
            v_ann->>'submittedAt',
            v_ann->'attachments',
            v_ann->>'provider',
            v_ann->>'created',
            (v_ann - 'id' - 'x' - 'y' - 'element' - 'text' - 'author' - 'isClient' - 'isAgent' - 'resolved' - 'parentId' - 'status' - 'submittedAt' - 'attachments' - 'provider' - 'created')
          )
          on conflict (version_id, manifest_id) do update set
            ord=excluded.ord, x=excluded.x, y=excluded.y, element=excluded.element, body=excluded.body, author=excluded.author,
            is_client=excluded.is_client, is_agent=excluded.is_agent, resolved=excluded.resolved, parent_id=excluded.parent_id,
            status=excluded.status, submitted_at=excluded.submitted_at, attachments=excluded.attachments, provider=excluded.provider, created=excluded.created, extras=excluded.extras
          returning id into v_ann_id;
          v_kept_anns := array_append(v_kept_anns, v_ann_id);
          v_ann_ord := v_ann_ord + 1;
        end loop;
        delete from public.annotations where version_id = v_version_id and not (id = any(v_kept_anns));

        v_version_ord := v_version_ord + 1;
      end loop;
      delete from public.versions where concept_id = v_concept_id and not (id = any(v_kept_versions));

      v_concept_ord := v_concept_ord + 1;
    end loop;
    delete from public.concepts where round_id = v_round_id and not (id = any(v_kept_concepts));

    v_round_ord := v_round_ord + 1;
  end loop;
  delete from public.rounds where project_id = v_project_id and not (id = any(v_kept_rounds));
end;
$$;
