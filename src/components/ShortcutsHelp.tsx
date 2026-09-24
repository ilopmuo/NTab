import { ui, useUI } from '@/app/store'
import { Kbd, Modal, ModalHeader } from './ui'

const GROUPS: [string, [string[], string][]][] = [
  [
    'General',
    [
      [['N'], 'Nueva tarea'],
      [['⌘', 'K'], 'Buscar y comandos'],
      [['?'], 'Esta ayuda'],
      [['Esc'], 'Cerrar panel'],
      [['⌘', 'clic'], 'Seleccionar varias tareas'],
    ],
  ],
  [
    'Ir a',
    [
      [['G', 'H'], 'Hoy'],
      [['G', 'I'], 'Bandeja de entrada'],
      [['G', 'U'], 'Próximo'],
      [['G', 'C'], 'Calendario'],
      [['G', 'B'], 'Hábitos'],
      [['G', 'E'], 'Rutinas'],
      [['G', 'K'], 'Cosas'],
      [['G', 'V'], 'Última vez'],
      [['G', 'A'], 'Compra'],
      [['G', 'O'], 'Notas'],
      [['G', 'P'], 'Personas'],
      [['G', 'J'], 'Proyectos'],
      [['G', 'M'], 'Plantillas'],
      [['G', 'T'], 'Objetivos'],
      [['G', 'F'], 'Pagos'],
      [['G', 'R'], 'Revisión semanal'],
      [['G', 'X'], 'Papelera'],
      [['G', 'S'], 'Ajustes'],
    ],
  ],
  [
    'En la captura rápida',
    [
      [['mañana', 'a las 10'], 'Fecha y hora'],
      [['cada lunes'], 'Repetición'],
      [['!alta'], 'Prioridad'],
      [['#tag'], 'Etiqueta'],
      [['+Proyecto'], 'Proyecto o área'],
      [['~30m'], 'Duración estimada'],
      [['insísteme'], 'Repetir el aviso hasta que la hagas'],
      [['⌘', '↵'], 'Añadir y seguir'],
    ],
  ],
]

export function ShortcutsHelp() {
  const open = useUI((s) => s.helpOpen)
  return (
    <Modal open={open} onClose={() => ui.help(false)} position="center">
      <ModalHeader title="Atajos de teclado" onClose={() => ui.help(false)} />
      <div className="grid gap-6 p-5 sm:grid-cols-2">
        {GROUPS.map(([title, items]) => (
          <div key={title} className={title === 'En la captura rápida' ? 'sm:col-span-2' : ''}>
            <h3 className="mb-2 text-[11.5px] font-semibold tracking-wider text-muted uppercase">{title}</h3>
            <div className="space-y-1.5">
              {items.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span>{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
