import { useMemo, useState, useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabase"

type TaskType = "cortar" | "fertilizar" | "quimicos" | "poscosecha"

const taskLabels: Record<TaskType, string> = {
  cortar: "Cortar",
  fertilizar: "Fertilizar",
  quimicos: "Químicos",
  poscosecha: "Poscosecha"
}

// =======================
// 🧠 FECHA HUMANA
// =======================
const formatDateTime = (date: string) => {
  const d = new Date(date)

  const day = d.getDate()
  const month = d.toLocaleString("es-CO", { month: "long" })

  const time = d.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })

  return `${day} de ${month} a las ${time}`
}

export default function GreenhouseMap({ greenhouseId, rows, columns }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // =============================
  // 📅 SEMANA
  // =============================
  const getWeekFromToday = () => {
    const today = new Date()
    const day = today.getDay()

    const start = new Date(today)
    start.setDate(today.getDate() - day)

    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    return {
      start_date: start.toISOString(),
      end_date: end.toISOString()
    }
  }

  const [currentWeek, setCurrentWeek] = useState<any>(getWeekFromToday())

  const changeWeek = (direction: number) => {
    setCurrentWeek((prev) => {
      const base = new Date(prev.start_date)

      const newStart = new Date(base)
      newStart.setDate(base.getDate() + direction * 7)

      const newEnd = new Date(newStart)
      newEnd.setDate(newStart.getDate() + 6)

      return {
        start_date: newStart.toISOString(),
        end_date: newEnd.toISOString()
      }
    })
  }

  const prevWeek = () => changeWeek(-1)
  const nextWeek = () => changeWeek(1)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "short"
    })

  // 🔥 CLAVE: formato DATE correcto
  const weekStart = currentWeek.start_date.split("T")[0]

  // =============================
  // 🔹 ESTADOS
  // =============================
  const [selectedBeds, setSelectedBeds] = useState(new Set<string>())
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [taskType, setTaskType] = useState<TaskType>("cortar")
  const [notes, setNotes] = useState("")
  const [mode, setMode] = useState<"view" | "select">("view")
  const [isDragging, setIsDragging] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedBedDetail, setSelectedBedDetail] = useState<any>(null)
const [createTaskOpen, setCreateTaskOpen] = useState(false)
const [newTaskName, setNewTaskName] = useState("")
const [newTaskType, setNewTaskType] = useState<TaskType>("cortar")
const [isPermanent, setIsPermanent] = useState(true)

  const cellSize = Math.max(18, Math.min(45, window.innerWidth * 0.7 / columns))
  const middleRow = Math.floor(rows / 2)

  // =============================
  // 🔹 DATA
  // =============================
 const { data: beds = [] } = useQuery({
  queryKey: ["beds", greenhouseId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("beds")
      .select("*")
      .eq("greenhouse_id", greenhouseId)

    if (error) {
      console.error("Error beds:", error)
      return []
    }

    return data ?? []
  }
})

const { data: tasks = [] } = useQuery({
  queryKey: ["tasks", greenhouseId, weekStart],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("greenhouse_id", greenhouseId)
      .eq("week_start", weekStart)

    if (error) {
      console.error("Error tasks:", error)
      return []
    }

    return data ?? []
  }
})


  // =============================
  // 🔹 MAPEO
  // =============================
  const bedMap = useMemo(() => {
    const map = new Map<string, string>()
    beds.forEach(b => {
      map.set(`${b.row_number}-${b.column_number}`, b.id)
    })
    return map
  }, [beds])

  const bedTaskMap = useMemo(() => {
    const map = new Map<string, any[]>()
    tasks.forEach(t => {
      if (t.bed_id) {
        const list = map.get(t.bed_id) || []
        map.set(t.bed_id, [...list, t])
      }
    })
    return map
  }, [tasks])

  // =============================
  // 🎨 COLOR
  // =============================
  const getColor = (tasks?: any[]) => {
    const safe = tasks ?? []

    if (safe.length === 0) return "bg-white"

    const allCompleted = safe.every(t => t.status === "completed")

    if (allCompleted) return "bg-green-400"

    return "bg-yellow-400"
  }

  // =============================
  // 🔥 ASIGNAR
  // =============================
  const assignMutation = useMutation({
  mutationFn: async (all: boolean) => {
    if (!user) throw new Error("No user")

    let inserts: any[] = []

    if (all) {
      inserts = beds.map(b => ({
        greenhouse_id: greenhouseId,
        bed_id: b.id,
        task_type: taskType,
        assigned_by: user.id,
        notes,
        week_start: weekStart
      }))
    } else {
      inserts = Array.from(selectedBeds)
        .map(key => {
          const bedId = bedMap.get(key)

          if (!bedId) return null

          return {
            greenhouse_id: greenhouseId,
            bed_id: bedId,
            task_type: taskType,
            assigned_by: user.id,
            notes,
            week_start: weekStart
          }
        })
        .filter(Boolean)
    }

    if (inserts.length === 0) {
      throw new Error("No hay camas seleccionadas")
    }

    const { error } = await supabase.from("tasks").insert(inserts)

    if (error) throw error

    return true
  },

  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] })

    setSelectedBeds(new Set())
    setMode("view")
    setAssignDialogOpen(false)
    setNotes("") // 🔥 CLAVE

    toast({ title: "Tarea asignada" })
  },

  onError: (err: any) => {
    console.error(err)
    toast({
      title: "Error",
      description: err.message
    })
  }
})

  // =============================
  // ✅ COMPLETAR
  // =============================
  const completeMutation = useMutation({
  mutationFn: async (taskId: string) => {
    const { error } = await supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", taskId)

    if (error) throw error

    return true
  },

  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] })

    toast({
      title: "Tarea completada"
    })
  },

  onError: (err: any) => {
    console.error(err)
    toast({
      title: "Error",
      description: err.message
    })
  }
})
  // =============================
  // 🔹 CLICK
  // =============================
  const handleClick = (key: string) => {
    const bedId = bedMap.get(key)
    const list = bedId ? (bedTaskMap.get(bedId) ?? []) : []

    if (mode === "select") {
      setSelectedBeds(prev => {
        const next = new Set(prev)
        next.has(key) ? next.delete(key) : next.add(key)
        return next
      })
      return
    }

    if (bedId) {
      setSelectedBedDetail({ tasks: list })
      setDetailOpen(true)
    }
  }

  return (
    <div>

      {/* HEADER */}
      <div className="flex justify-between mb-4">
        <Button onClick={prevWeek}>⬅</Button>

        <div className="text-center">
          <h2 className="font-bold">Semana</h2>
          <p>
            {formatDate(currentWeek.start_date)} → {formatDate(currentWeek.end_date)}
          </p>
        </div>

        <Button onClick={nextWeek}>➡</Button>
      </div>

      <div className="flex gap-4">

        {/* PANEL */}
        <div className="w-44 space-y-3">

  {/* TAREAS NORMALES (NO TOCAR) */}
  {Object.entries(taskLabels).map(([key, label]) => (
    <button
      key={key}
      onClick={() => {
        setMode("view")
        setSelectedBeds(new Set())
        setTaskType(key as TaskType)
        setAssignDialogOpen(true)
      }}
      className="w-full border p-2 rounded"
    >
      {label}
    </button>
  ))}

  {/* 🔥 BOTÓN NUEVO */}
  <Button
    onClick={() => setCreateTaskOpen(true)}
    className="w-full"
    variant="outline"
  >
    + Nueva tarea
  </Button>

</div>

        {/* MAPA */}
        <div className="flex-1 overflow-auto border p-2 rounded">
          {Array.from({ length: rows }).map((_, r) => {
            if (r === middleRow) {
              return <div key="camino" className="bg-gray-200 text-center">Camino</div>
            }

            return (
              <div key={r} className="flex gap-1">
                {Array.from({ length: columns }).map((_, c) => {
                  const key = `${r + 1}-${c + 1}`
                  const bedId = bedMap.get(key)
                  const list = bedId ? (bedTaskMap.get(bedId) ?? []) : []

                  return (
                    <button
                      key={key}
                      onClick={() => handleClick(key)}
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={() => setIsDragging(false)}
                      onMouseEnter={() => {
                        if (isDragging && mode === "select") handleClick(key)
                      }}
                      style={{ width: cellSize, height: cellSize }}
                      className={cn(
                        "border rounded",
                        getColor(list),
                        selectedBeds.has(key) && "ring-2 ring-black"
                      )}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* MODAL ASIGNAR */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar tarea</DialogTitle>
          </DialogHeader>

          <Textarea
            placeholder="Notas..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex gap-2 mt-4">
            <Button onClick={() => assignMutation.mutate(true)}>
              Todas
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setMode("select")
                setAssignDialogOpen(false)
              }}
            >
              Manual
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR MANUAL */}
      {mode === "select" && selectedBeds.size > 0 && (
        <div className="fixed bottom-6 right-6 bg-white border p-4 rounded shadow z-50">
          <p>{selectedBeds.size} camas</p>
          <Button onClick={() => assignMutation.mutate(false)}>
            Confirmar
          </Button>
        </div>
      )}

     {/* DETALLE */}
<Dialog open={detailOpen} onOpenChange={setDetailOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Detalle</DialogTitle>
    </DialogHeader>

    {selectedBedDetail?.tasks?.length ? (
      selectedBedDetail.tasks.map((t, i) => (
        <div key={i} className="border p-3 rounded mb-2 space-y-1">

          <p className="font-semibold capitalize">{t.task_type}</p>

          {/* 📅 CREACIÓN */}
          <p className="text-sm text-gray-600">
            📌 Creada: {formatDateTime(t.created_at)}
          </p>

          {/* 📝 NOTAS */}
          {t.notes && (
            <p className="text-sm italic text-gray-700">
              {t.notes}
            </p>
          )}

          {/* ✅ ESTADO */}
          {t.status === "completed" ? (
            <>
              <p className="text-green-600 font-semibold">
                ✔ Completada
              </p>

              {t.completed_at && (
                <p className="text-xs text-gray-500">
                  🕒 {formatDateTime(t.completed_at)}
                </p>
              )}
            </>
          ) : (
            <Button
              size="sm"
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate(t.id)}
            >
              Marcar como hecha
            </Button>
          )}

        </div>
      ))
    ) : (
      <p>Sin tareas</p>
    )}
  </DialogContent>
</Dialog>

    </div>
  )
}