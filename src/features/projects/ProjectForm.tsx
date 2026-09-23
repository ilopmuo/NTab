import { useState } from 'react'
import type { Project } from '@/db/types'
import { db } from '@/db/db'
import { createProject } from '@/db/actions'
import { useAreas } from '@/db/hooks'
import { COLORS } from '@/components/icons'
import { Button, ColorPicker, Field, Input, Modal, ModalHeader, Select, Textarea } from '@/components/ui'

export function ProjectForm({
  project,
  open,
  onClose,
  defaultAreaId,
  onSaved,
}: {
  project?: Project
  open: boolean
  onClose: () => void
  defaultAreaId?: string
  onSaved?: (p: Project) => void
}) {
  return (
    <Modal open={open} onClose={onClose} position="center">
      {open && <Form project={project} onClose={onClose} defaultAreaId={defaultAreaId} onSaved={onSaved} />}
    </Modal>
  )
}

function Form({
  project,
  onClose,
  defaultAreaId,
  onSaved,
}: {
  project?: Project
  onClose: () => void
  defaultAreaId?: string
  onSaved?: (p: Project) => void
}) {
  const areas = useAreas()
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [areaId, setAreaId] = useState(project?.areaId ?? defaultAreaId ?? '')
  const [deadline, setDeadline] = useState(project?.deadline ?? '')
  const [color, setColor] = useState(project?.color ?? COLORS[0])

  const save = async () => {
    if (!name.trim()) return
    const data = { name: name.trim(), description, areaId: areaId || undefined, deadline: deadline || undefined, color }
    if (project) {
      await db.transaction('rw', db.projects, db.tasks, async () => {
        await db.projects.update(project.id, data)
        if (data.areaId !== project.areaId) {
          await db.tasks.where('projectId').equals(project.id).modify({ areaId: data.areaId })
        }
      })
      onSaved?.({ ...project, ...data })
    } else {
      onSaved?.(await createProject(data))
    }
    onClose()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <ModalHeader title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose} />
      <div className="space-y-4 p-5">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del proyecto" className="h-11 text-[15px]" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="¿Qué significa terminar este proyecto?"
          rows={2}
          className="rounded-lg border border-line bg-bg px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Área">
            <Select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
              <option value="">Sin área</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha límite">
            <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} colors={COLORS} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {project ? 'Guardar' : 'Crear proyecto'}
        </Button>
      </div>
    </form>
  )
}
