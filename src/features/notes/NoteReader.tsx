import { Fragment } from 'react'
import { m as motion } from 'motion/react'
import { Check } from 'lucide-react'
import type { Note } from '@/db/types'
import { createNote } from '@/db/moreActions'
import { href, navigate } from '@/app/router'
import { findNote } from '@/lib/notes'
import { inlineTokens, noteBlocks, type Block } from '@/lib/noteFormat'
import { cx } from '@/components/ui'

/** Una línea con su formato: negrita, cursiva, enlaces, [[notas]] y #etiquetas */
function Inline({ text, note, notes, onTag }: { text: string; note: Note; notes: Note[]; onTag: (tag: string) => void }) {
  return (
    <>
      {inlineTokens(text).map((x, i) => {
        switch (x.t) {
          case 'bold':
            return <strong key={i} className="font-bold">{x.v}</strong>
          case 'italic':
            return <em key={i}>{x.v}</em>
          case 'strike':
            return <s key={i} className="text-muted">{x.v}</s>
          case 'code':
            return <code key={i} className="rounded-md bg-fill px-1.5 py-0.5 font-mono text-[0.88em]">{x.v}</code>
          case 'link':
            return (
              <a key={i} href={x.href} target="_blank" rel="noreferrer" className="font-medium text-blue underline decoration-1 underline-offset-2">
                {x.v}
              </a>
            )
          case 'wiki': {
            const target = findNote(notes, x.v)
            return target ? (
              <a key={i} href={href(`/notes/${target.id}`)} className="font-medium text-blue">
                {x.v}
              </a>
            ) : (
              <button
                key={i}
                type="button"
                onClick={async () => {
                  const n = await createNote({ title: x.v, projectId: note.projectId, areaId: note.areaId })
                  navigate(`/notes/${n.id}`)
                }}
                className="font-medium text-muted underline decoration-dashed underline-offset-2"
                title={`Crear «${x.v}»`}
              >
                {x.v}
              </button>
            )
          }
          case 'tag':
            return (
              <button key={i} type="button" onClick={() => onTag(x.v)} className="rounded-md bg-accent-soft px-1 font-medium text-blue">
                #{x.v}
              </button>
            )
          default:
            return <Fragment key={i}>{x.v}</Fragment>
        }
      })}
    </>
  )
}

/**
 * La nota con formato (como Bear) y sus casillas pulsables (como Notas de
 * Apple). Un toque en el texto pasa a escribir.
 */
export function NoteReader({
  content,
  note,
  notes,
  onToggle,
  onEdit,
  onTag,
}: {
  content: string
  note: Note
  notes: Note[]
  onToggle: (line: number) => void
  onEdit: () => void
  onTag: (tag: string) => void
}) {
  const blocks = noteBlocks(content)
  // Clave estable por texto (las casillas se reordenan al marcarlas)
  const seen = new Map<string, number>()
  const keyOf = (b: Block) => {
    const base = 'text' in b ? `${b.type}:${b.text}` : `${b.type}:${b.line}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}#${n}`
  }
  return (
    <div
      className="min-h-[40vh] flex-[1_0_auto] cursor-text text-[17px] leading-[1.65]"
      onClick={(e) => {
        // Tocar el texto (no un enlace, una casilla o una etiqueta) pasa a escribir
        if (!(e.target as HTMLElement).closest('a,button,input')) onEdit()
      }}
    >
      {blocks.map((b) => {
        const key = keyOf(b)
        switch (b.type) {
          case 'h':
            return b.level === 1 ? (
              <h2 key={key} className="mt-4 mb-1 text-[24px] leading-tight font-bold tracking-tight">
                <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
              </h2>
            ) : b.level === 2 ? (
              <h3 key={key} className="mt-3 mb-0.5 text-[20px] leading-snug font-bold">
                <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
              </h3>
            ) : (
              <h4 key={key} className="mt-2 text-[17px] font-bold">
                <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
              </h4>
            )
          case 'check':
            return (
              <motion.div key={key} layout="position" className="flex items-start gap-2.5 py-0.5" style={{ paddingLeft: b.indent * 24 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={b.done}
                  aria-label={b.text || 'Casilla'}
                  onClick={() => onToggle(b.line)}
                  className={cx(
                    'hit mt-[5px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border-[1.75px] transition-colors',
                    b.done ? 'border-blue bg-blue text-white' : 'border-line-strong hover:border-blue',
                  )}
                >
                  {b.done && <Check size={12} strokeWidth={3.4} />}
                </button>
                <span className={cx('min-w-0 flex-1', b.done && 'text-muted line-through decoration-1')}>
                  <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
                </span>
              </motion.div>
            )
          case 'li':
            return (
              <div key={key} className="flex gap-2.5" style={{ paddingLeft: b.indent * 24 }}>
                <span className="font-num w-4 shrink-0 text-right text-muted" aria-hidden>
                  {b.n ? `${b.n}.` : '•'}
                </span>
                <span className="min-w-0 flex-1">
                  <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
                </span>
              </div>
            )
          case 'quote':
            return (
              <blockquote key={key} className="border-l-[3px] border-line-strong pl-3 text-muted italic">
                <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
              </blockquote>
            )
          case 'code':
            return (
              <pre key={key} className="my-2 overflow-x-auto rounded-xl bg-fill-2 p-3 font-mono text-[14px] leading-relaxed">
                {b.text}
              </pre>
            )
          case 'hr':
            return <hr key={key} className="my-3 border-line" />
          case 'blank':
            return <div key={key} className="h-[0.8em]" aria-hidden />
          default:
            return (
              <p key={key}>
                <Inline text={b.text} note={note} notes={notes} onTag={onTag} />
              </p>
            )
        }
      })}
    </div>
  )
}
