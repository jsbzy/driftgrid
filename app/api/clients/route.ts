import { NextResponse } from 'next/server';
import { getClients } from '@/lib/storage';
import { getUserId } from '@/lib/auth';

export async function GET() {
  const userId = await getUserId();
  const clients = await getClients(userId);
  return NextResponse.json(clients);
}
