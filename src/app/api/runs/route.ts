import { listRuns } from '@/lib/supabase'

export async function GET() {
  const runs = await listRuns(20)
  return Response.json(runs)
}
