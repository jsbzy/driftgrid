# Manifest Schema

Every Drift project has a `manifest.json` at `projects/{client}/{project}/manifest.json`. Keep it in sync whenever you create or modify concepts or versions.

---

## Top-Level Structure

```json
{
  "project": {
    "name": "Project Display Name",
    "slug": "project-slug",
    "client": "client-slug",
    "canvas": "landscape-16-9",
    "created": "2026-03-01T00:00:00.000Z",
    "links": []
  },
  "concepts": [],
  "workingSets": [],
  "comments": [],
  "clientEdits": []
}
```

---

## Concept Entry

```json
{
  "id": "concept-1",
  "label": "Concept 1",
  "description": "One-liner describing the concept's direction",
  "position": 1,
  "visible": true,
  "versions": []
}
```

- `id`: matches the folder name (e.g., `concept-1`)
- `description`: auto-generate a short, meaningful one-liner based on the design direction
- `position`: 1-indexed, determines display order
- `visible`: set to `true` unless explicitly hiding from client

---

## Version Entry (inside a concept's `versions` array)

```json
{
  "id": "v1",
  "number": 1,
  "file": "concept-1/v1.html",
  "parentId": null,
  "changelog": "Initial version",
  "visible": true,
  "starred": false,
  "created": "2026-03-01T00:00:00.000Z",
  "thumbnail": null
}
```

- `file`: path relative to the project root
- `parentId`: null for v1; for subsequent versions, the `id` of the version it was branched from
- `changelog`: brief description of what changed — required for every version after v1
- `thumbnail`: null until `npm run generate-thumbs` is run

---

## Minimal New Project Manifest

When creating a new project from scratch, start with this and fill in the fields:

```json
{
  "project": {
    "name": "",
    "slug": "",
    "client": "",
    "canvas": "",
    "created": "",
    "links": []
  },
  "concepts": [
    {
      "id": "concept-1",
      "label": "Concept 1",
      "description": "",
      "position": 1,
      "visible": true,
      "versions": [
        {
          "id": "v1",
          "number": 1,
          "file": "concept-1/v1.html",
          "parentId": null,
          "changelog": "Initial version",
          "visible": true,
          "starred": false,
          "created": "",
          "thumbnail": null
        }
      ]
    }
  ],
  "workingSets": [],
  "comments": [],
  "clientEdits": []
}
```
