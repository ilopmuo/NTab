import { FileText, Hash, Link2, Plus } from 'lucide-react'
import type { Note } from '@/db/types'
import { createNote } from '@/db/actions'
import { href, navigate } from '@/app/router'
import { backlinks, findNote, noteLinks, noteTags } from '@/lib/notes'
import { cx } from '@/components/ui'

/** Sugerencias de títulos mientras se escribe «[[…» (se eligen con ↑ ↓ e Intro) */
export function LinkSuggestions({ items, active, onPick }: { items: string[]; active: number; onPick: (title: string) => void }) {
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+92px)] z-10 mt-2 lg:bottom-4">
      <div role="listbox" id="note-link-suggestions" aria-label="Enlazar a otra nota" className="glass-thick overflow-hidden rounded-[16px] p-1 shadow-[var(--c-shadow-lg)]">
        <p className="px-3 pt-1.5 pb-1 text-[12px] font-semibold text-muted">Enlazar a…</p>
        {items.map((t, i) => (
          <button
            key={t}
            type="button"
            role="option"
            id={`note-link-${i}`}
            aria-selected={i === active}
            // Sin robar el foco al texto
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(t)}
            className={cx('flex h-10 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-[15px]', i === active ? 'bg-accent-fill text-white' : 'hover:bg-hover')}
          >
            <FileText size={15} strokeWidth={2.3} aria-hidden className={i === active ? 'text-white' : 'text-muted'} />
            <span className="truncate">{t}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Quita las marcas de enlace para enseñar la línea como texto */
const plain = (line: string) => line.replace(/\[\[([^[\]\n]+?)\]\]/g, '$1').replace(/^\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?/, '')

/**
 * Debajo de la nota: a qué notas enlaza (las que aún no existen, para crearlas
 * de un toque), qué notas la mencionan y sus #etiquetas.
 */
export function NoteConnections({ note, title, content, notes, onTag }: { note: Note; title: string; content: string; notes: Note[]; onTag: (tag: string) => void }) {
  const links = noteLinks(content)
  const mentions = backlinks(notes, { id: note.id, title })
  const tags = noteTags(content)
  if (!links.length && !mentions.length && !tags.length) return null
  return (
    <div className="mt-8 space-y-5 border-t border-line pt-5">
      {links.length > 0 && (
        <section aria-labelledby="note-links">
          <h2 id="note-links" className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-muted">
            <Link2 size={14} strokeWidth={2.4} aria-hidden /> Enlaza a
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {links.map((t) => {
              const target = findNote(notes, t)
              return target ? (
                <a key={t} href={href(`/notes/${target.id}`)} className="hit inline-flex h-8 items-center gap-1.5 rounded-full bg-fill px-3 text-[14px] font-medium text-fg transition-colors hover:bg-hover">
                  <FileText size={13} strokeWidth={2.4} aria-hidden /> {target.title}
                </a>
              ) : (
                <button
                  key={t}
                  type="button"
                  onClick={async () => {
                    const n = await createNote({ title: t, projectId: note.projectId, areaId: note.areaId })
                    navigate(`/notes/${n.id}`)
                  }}
                  className="hit inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-line-strong px-3 text-[14px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  <Plus size={13} strokeWidth={2.6} aria-hidden /> Crear «{t}»
                </button>
              )
            })}
          </div>
        </section>
      )}
      {mentions.length > 0 && (
        <section aria-labelledby="note-mentions">
          <h2 id="note-mentions" className="mb-2 text-[13px] font-bold text-muted">
            Mencionada en {mentions.length}
          </h2>
          <div className="overflow-hidden rounded-[14px] bg-fill-2">
            {mentions.map(({ note: n, line }) => (
              <a key={n.id} href={href(`/notes/${n.id}`)} className="block px-3.5 py-2.5 transition-colors not-last:shadow-[inset_0_-1px_0_var(--c-border)] hover:bg-hover">
                <span className="block truncate text-[15px] font-semibold">{n.title || 'Sin título'}</span>
                <span className="block truncate text-[13px] text-muted">{plain(line)}</span>
              </a>
            ))}
          </div>
        </section>
      )}
      {tags.length > 0 && (
        <section aria-labelledby="note-tags">
          <h2 id="note-tags" className="mb-2 text-[13px] font-bold text-muted">
            Etiquetas
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTag(t)}
                title={`Ver las notas con #${t}`}
                className="hit inline-flex h-8 items-center gap-1 rounded-full bg-fill px-3 text-[14px] font-medium text-fg transition-colors hover:bg-hover"
              >
                <Hash size={13} strokeWidth={2.6} aria-hidden />
                {t}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
