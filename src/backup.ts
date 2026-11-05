/**
 * データの書き出し・読み込み（端末をまたいだ引っこし・バックアップ用）と、消されにくくする設定。
 * 保存先は localStorage のまま。書き出しは「PULSAR1:」で始まる文字のコード（中身は JSON を base64 にしたもの）。
 */
const KEYS = ['pulsar-save-v1', 'pulsar-place', 'pulsar-skin', 'pulsar-chara', 'pulsar-view', 'pulsar-vol', 'pulsar-quality']
const PREFIX = 'PULSAR1:'

const toB64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)))

export function exportCode(): string {
  const data: Record<string, string> = {}
  for (const k of KEYS) {
    try {
      const v = localStorage.getItem(k)
      if (v !== null) data[k] = v
    } catch {
      /* noop */
    }
  }
  return PREFIX + toB64(JSON.stringify({ v: 1, at: Date.now(), data }))
}

/** 読み込み。成功したら true（ゲームのデータが入っていないコードは受け付けない） */
export function importCode(text: string): { ok: boolean; reason?: string } {
  const code = text.trim().replace(/\s+/g, '')
  if (!code.startsWith(PREFIX)) return { ok: false, reason: 'PULSAR のデータではないようです' }
  let parsed: { v: number; data: Record<string, string> }
  try {
    parsed = JSON.parse(fromB64(code.slice(PREFIX.length)))
  } catch {
    return { ok: false, reason: 'コードがこわれています（途中で切れていませんか？）' }
  }
  const save = parsed?.data?.['pulsar-save-v1']
  try {
    if (!save || !JSON.parse(save).pet) return { ok: false, reason: 'ペットのデータが入っていません' }
  } catch {
    return { ok: false, reason: 'ペットのデータが読めません' }
  }
  try {
    for (const k of KEYS) if (k in parsed.data) localStorage.setItem(k, parsed.data[k])
  } catch {
    return { ok: false, reason: 'この端末に保存できませんでした' }
  }
  return { ok: true }
}

/** ブラウザに「このサイトのデータは自動で消さないで」と頼む（対応していない環境では何もしない） */
export async function requestPersist(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
