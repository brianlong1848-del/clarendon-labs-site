import { NextResponse } from 'next/server'
import { consoleAuthed } from '@/lib/console'
import { ASSETS_FOLDER, driveConfigured, exportsFolder, listFolder } from '@/lib/drive'
import { PUBLISH_APPS } from '@/lib/publish/platforms'

// Studio's Google Drive picker: one folder of Marketing/Assets at a time.
//   GET ?folder=<id>   that folder's sub-folders and photos/videos
//   GET ?app=<appId>   the app's exports folder (Assets/<App>/05_Exports), else Assets
// Read-only, through the site's service account; the phone never holds a
// Google credential.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  if (!(await consoleAuthed())) return NextResponse.json({ error: 'not authorised' }, { status: 401 })
  const params = new URL(req.url).searchParams
  try {
    let folder = params.get('folder')
    if (!folder || !/^[\w-]+$/.test(folder)) {
      const app = PUBLISH_APPS.find((a) => a.id === params.get('app'))
      folder = app ? await exportsFolder(app.name) : ASSETS_FOLDER
    }
    return NextResponse.json(await listFolder(folder))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: driveConfigured() ? 502 : 503 })
  }
}
