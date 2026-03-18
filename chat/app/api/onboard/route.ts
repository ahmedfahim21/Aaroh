import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { NextResponse } from 'next/server'

const execFileAsync = promisify(execFile)

// Repo root is one level up from the chat/ directory
const REPO_ROOT = resolve(process.cwd(), '..')
const ONBOARD_SCRIPT = join(REPO_ROOT, 'onboard_merchant.py')
const DEPLOY_DIR = join(REPO_ROOT, 'deploy')

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[-\s]+/g, '-')
    .replace(/^-|-$/g, '') || 'merchant'
}

async function xlsxToCsvBuffer(buffer: Buffer): Promise<Buffer<ArrayBuffer>> {
  // Dynamic import so the xlsx package is only loaded when needed
  const XLSX = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  return Buffer.from(csv, 'utf-8') as Buffer<ArrayBuffer>
}

export async function POST(req: Request) {
  let tmpPath: string | null = null
  try {
    const formData = await req.formData()
    const merchantName = (formData.get('merchant_name') as string | null)?.trim()
    const merchantWallet = (formData.get('merchant_wallet') as string | null)?.trim()
    const catalogue = formData.get('catalogue') as File | null

    if (!merchantName || !merchantWallet || !catalogue) {
      return NextResponse.json({ detail: 'merchant_name, merchant_wallet, and catalogue are required.' }, { status: 422 })
    }

    const ext = catalogue.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'xlsx') {
      return NextResponse.json({ detail: 'Only .csv and .xlsx files are allowed.' }, { status: 422 })
    }

    let fileBuffer = Buffer.from(await catalogue.arrayBuffer())
    if (!fileBuffer.length) {
      return NextResponse.json({ detail: 'Catalogue file is empty.' }, { status: 422 })
    }

    if (ext === 'xlsx') {
      fileBuffer = await xlsxToCsvBuffer(fileBuffer)
    }

    // Write to a temp CSV file
    tmpPath = join(tmpdir(), `catalogue-${Date.now()}.csv`)
    writeFileSync(tmpPath, fileBuffer)

    const slug = slugify(merchantName)
    const outputDir = join(DEPLOY_DIR, slug)
    mkdirSync(outputDir, { recursive: true })

    await execFileAsync('python3', [
      ONBOARD_SCRIPT,
      '--catalogue', tmpPath,
      '--merchant-name', merchantName,
      '--merchant-wallet', merchantWallet,
      '--output-dir', outputDir,
    ], { cwd: REPO_ROOT })

    return NextResponse.json({ status: 'ok', merchant_name: merchantName, output_dir: outputDir })
  } catch (err: unknown) {
    const detail =
      err instanceof Error
        ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr?.trim() || err.message
        : 'Onboarding failed.'
    return NextResponse.json({ detail }, { status: 422 })
  } finally {
    if (tmpPath) {
      try { rmSync(tmpPath) } catch {}
    }
  }
}
