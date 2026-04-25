import { useEffect, useMemo, useState } from "react"
import { Filter, X } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import type { Tables, TablesInsert } from "@/types/supabase"

type Bed = Tables<"beds">
type Task = Tables<"tasks">
type TaskDefinition = Tables<"task_definitions">
type TaskInsert = TablesInsert<"tasks">
type TaskType = Task["task_type"]
type TaskStatus = Task["status"]

type GreenhouseMapProps = {
  greenhouseId: string
  rows: number
  columns: number
}

type FilterState = {
  taskTypes: TaskType[]
  statuses: TaskStatus[]
  createdDate: string
  completedDate: string
}

type LastAssignedBatch = {
  ids: string[]
  taskType: TaskType
  createdAt: string
  count: number
}

const taskLabels: Record<TaskType, string> = {
  cortar: "Cortar",
  fertilizar: "Fertilizar",
  quimicos: "Quimicos",
  poscosecha: "Poscosecha"
}

const statusLabels: Record<TaskStatus, string> = {
  pending: "Pendientes",
  completed: "Cumplidas"
}

const createDefaultFilters = (): FilterState => ({
  taskTypes: [],
  statuses: [],
  createdDate: "",
  completedDate: ""
})

const formatDateTime = (date: string) => {
  const parsedDate = new Date(date)

  const day = parsedDate.getDate()
  const month = parsedDate.toLocaleString("es-CO", { month: "long" })
  const time = parsedDate.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })

  return `${day} de ${month} a las ${time}`
}

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

const getDateOnly = (value: string | null) => value?.split("T")[0] ?? ""

const getLocalDateOnly = (value: string | null) => {
  if (!value) return ""

  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const getWeekRangeFromStart = (startDate: string) => {
  const start = new Date(startDate)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    start_date: start.toISOString(),
    end_date: end.toISOString()
  }
}

const getWeekStartDate = (value: string) => {
  const date = new Date(value)
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  start.setDate(date.getDate() - date.getDay())

  return start.toISOString().split("T")[0]
}

const toggleArrayValue = <T extends string>(items: T[], value: T) =>
  items.includes(value)
    ? items.filter(item => item !== value)
    : [...items, value]

const buildBedTaskMap = (items: Task[]) => {
  const map = new Map<string, Task[]>()

  items.forEach(task => {
    if (!task.bed_id) return

    const current = map.get(task.bed_id) ?? []
    map.set(task.bed_id, [...current, task])
  })

  return map
}

const getTaskWeekStart = (task: Task) => {
  if (task.week_start) {
    return getDateOnly(task.week_start)
  }

  return getWeekStartDate(task.created_at)
}

const mergeTasksById = (current: Task[], incoming: Task[]) => {
  const map = new Map<string, Task>()

  current.forEach(task => {
    map.set(task.id, task)
  })

  incoming.forEach(task => {
    map.set(task.id, task)
  })

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

const removeTasksById = (current: Task[], ids: string[]) => {
  const idsToRemove = new Set(ids)
  return current.filter(task => !idsToRemove.has(task.id))
}

export default function GreenhouseMap({
  greenhouseId,
  rows,
  columns
}: GreenhouseMapProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [currentWeek, setCurrentWeek] = useState(getWeekFromToday())
  const [selectedBeds, setSelectedBeds] = useState(new Set<string>())
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [taskType, setTaskType] = useState<TaskType>("cortar")
  const [notes, setNotes] = useState("")
  const [mode, setMode] = useState<"view" | "select">("view")
  const [isDragging, setIsDragging] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedBedDetail, setSelectedBedDetail] = useState<{
    bedKey: string
    tasks: Task[]
  } | null>(null)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [newTaskName, setNewTaskName] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>(createDefaultFilters)
  const [draftFilters, setDraftFilters] = useState<FilterState>(createDefaultFilters)
  const [autoAdjustedWeek, setAutoAdjustedWeek] = useState(false)
  const [lastAssignedBatch, setLastAssignedBatch] = useState<LastAssignedBatch | null>(null)

  const viewportWidth = typeof window === "undefined" ? 1024 : window.innerWidth
  const cellSize = Math.max(18, Math.min(45, (viewportWidth * 0.7) / columns))
  const middleRow = Math.floor(rows / 2)
  const weekStart = currentWeek.start_date.split("T")[0]

  const changeWeek = (direction: number) => {
    setAutoAdjustedWeek(true)
    setCurrentWeek(prev => {
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

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("es-CO", {
      day: "numeric",
      month: "short"
    })

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

      return (data ?? []) as Bed[]
    }
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", greenhouseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("greenhouse_id", greenhouseId)

      if (error) {
        console.error("Error tasks:", error)
        return []
      }

      return (data ?? []) as Task[]
    }
  })

  const { data: taskDefinitions = [] } = useQuery({
    queryKey: ["task-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_definitions")
        .select("*")

      if (error) {
        console.error("Error task_definitions:", error)
        return []
      }

      return (data ?? []) as TaskDefinition[]
    }
  })

  const bedMap = useMemo(() => {
    const map = new Map<string, string>()
    beds.forEach(bed => {
      map.set(`${bed.row_number}-${bed.column_number}`, bed.id)
    })
    return map
  }, [beds])

  const currentWeekTasks = useMemo(
    () => tasks.filter(task => getTaskWeekStart(task) === weekStart),
    [tasks, weekStart]
  )
  const currentWeekBedTaskMap = useMemo(
    () => buildBedTaskMap(currentWeekTasks),
    [currentWeekTasks]
  )

  const hasActiveFilters = useMemo(
    () =>
      filters.taskTypes.length > 0 ||
      filters.statuses.length > 0 ||
      Boolean(filters.createdDate) ||
      Boolean(filters.completedDate),
    [filters]
  )

  const shouldSearchAllTasks =
    Boolean(filters.createdDate) || Boolean(filters.completedDate)

  const filteredTasks = useMemo(() => {
    const sourceTasks = shouldSearchAllTasks ? tasks : currentWeekTasks

    return sourceTasks.filter(task => {
      if (
        filters.taskTypes.length > 0 &&
        !filters.taskTypes.includes(task.task_type)
      ) {
        return false
      }

      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(task.status)
      ) {
        return false
      }

      if (
        filters.createdDate &&
        getLocalDateOnly(task.created_at) !== filters.createdDate
      ) {
        return false
      }

      if (
        filters.completedDate &&
        getLocalDateOnly(task.completed_at) !== filters.completedDate
      ) {
        return false
      }

      return true
    })
  }, [currentWeekTasks, filters, shouldSearchAllTasks, tasks])

  const visibleTasks = hasActiveFilters ? filteredTasks : currentWeekTasks
  const visibleBedTaskMap = useMemo(
    () => buildBedTaskMap(visibleTasks),
    [visibleTasks]
  )
  const visibleBedIds = useMemo(
    () =>
      new Set(
        visibleTasks
          .map(task => task.bed_id)
          .filter((bedId): bedId is string => Boolean(bedId))
      ),
    [visibleTasks]
  )

  useEffect(() => {
    if (autoAdjustedWeek || tasks.length === 0 || currentWeekTasks.length > 0) {
      return
    }

    const latestTask = [...tasks].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    if (!latestTask) {
      setAutoAdjustedWeek(true)
      return
    }

    setCurrentWeek(getWeekRangeFromStart(getTaskWeekStart(latestTask)))
    setAutoAdjustedWeek(true)
  }, [autoAdjustedWeek, currentWeekTasks.length, tasks])

  const summary = useMemo(() => {
    const totalTasks = visibleTasks.length
    const completed = visibleTasks.filter(task => task.status === "completed").length
    const pending = visibleTasks.filter(task => task.status === "pending").length
    const bedsWithTasks = new Set(
      visibleTasks
        .map(task => task.bed_id)
        .filter((bedId): bedId is string => Boolean(bedId))
    ).size

    return {
      totalTasks,
      completed,
      pending,
      bedsWithTasks
    }
  }, [visibleTasks])

  const activeFilterBadges = useMemo(() => {
    const badges: string[] = []

    filters.taskTypes.forEach(type => {
      badges.push(taskLabels[type])
    })

    if (filters.statuses.length > 0) {
      badges.push(filters.statuses.map(status => statusLabels[status]).join(" + "))
    }

    if (filters.createdDate) {
      badges.push(`Creadas: ${filters.createdDate}`)
    }

    if (filters.completedDate) {
      badges.push(`Realizadas: ${filters.completedDate}`)
    }

    return badges
  }, [filters])

  const activeFilterCount = activeFilterBadges.length

  const getColor = (taskList: Task[]) => {
    if (taskList.length === 0) return "bg-white"
    if (taskList.every(task => task.status === "completed")) return "bg-green-400"
    return "bg-yellow-400"
  }

  const openFiltersModal = () => {
    setDraftFilters(filters)
    setFiltersOpen(true)
  }

  const applyFilters = () => {
    setFilters(draftFilters)
    setFiltersOpen(false)
  }

  const clearFilters = () => {
    const emptyFilters = createDefaultFilters()
    setDraftFilters(emptyFilters)
    setFilters(emptyFilters)
    setFiltersOpen(false)
  }

  const assignMutation = useMutation({
    mutationFn: async (assignToAll: boolean) => {
      if (!user) {
        throw new Error("No hay una sesion activa para asignar tareas")
      }

      const createdAt = new Date().toISOString()
      let inserts: TaskInsert[] = []

      if (assignToAll) {
        inserts = beds.map(bed => ({
          greenhouse_id: greenhouseId,
          bed_id: bed.id,
          task_type: taskType,
          assigned_by: user.id,
          created_at: createdAt,
          notes,
          week_start: weekStart
        }))
      } else {
        const manualInserts: TaskInsert[] = []

        Array.from(selectedBeds).forEach(key => {
          const bedId = bedMap.get(key)

          if (!bedId) return

          manualInserts.push({
            greenhouse_id: greenhouseId,
            bed_id: bedId,
            task_type: taskType,
            assigned_by: user.id,
            created_at: createdAt,
            notes,
            week_start: weekStart
          })
        })

        inserts = manualInserts
      }

      if (inserts.length === 0) {
        throw new Error("No hay camas seleccionadas")
      }

      const { data, error } = await supabase
        .from("tasks")
        .insert(inserts)
        .select("*")

      if (error) throw error

      return (data ?? []) as Task[]
    },

    onSuccess: insertedTasks => {
      queryClient.setQueryData<Task[]>(["tasks", greenhouseId], current =>
        mergeTasksById(current ?? [], insertedTasks)
      )
      queryClient.invalidateQueries({ queryKey: ["tasks", greenhouseId] })
      setLastAssignedBatch({
        ids: insertedTasks.map(task => task.id),
        taskType,
        createdAt: insertedTasks[0]?.created_at ?? new Date().toISOString(),
        count: insertedTasks.length
      })
      setSelectedBeds(new Set())
      setMode("view")
      setAssignDialogOpen(false)
      setNotes("")

      toast({ title: "Tarea asignada" })
    },

    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const undoAssignMutation = useMutation({
    mutationFn: async () => {
      if (!lastAssignedBatch || lastAssignedBatch.ids.length === 0) {
        throw new Error("No hay una asignacion reciente para deshacer")
      }

      const { error } = await supabase
        .from("tasks")
        .delete()
        .in("id", lastAssignedBatch.ids)

      if (error) throw error

      return lastAssignedBatch.ids
    },

    onSuccess: deletedIds => {
      queryClient.setQueryData<Task[]>(["tasks", greenhouseId], current =>
        removeTasksById(current ?? [], deletedIds)
      )
      queryClient.invalidateQueries({ queryKey: ["tasks", greenhouseId] })
      setLastAssignedBatch(null)
      setSelectedBeds(new Set())
      setMode("view")
      toast({ title: "Ultima asignacion deshecha" })
    },

    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

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
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", greenhouseId] })
      toast({ title: "Tarea completada" })
    },

    onError: (error: Error) => {
      console.error(error)
      toast({
        title: "Error",
        description: error.message
      })
    }
  })

  const handleClick = (key: string) => {
    const bedId = bedMap.get(key)
    const fullList = bedId ? currentWeekBedTaskMap.get(bedId) ?? [] : []
    const filteredList = bedId ? visibleBedTaskMap.get(bedId) ?? [] : []
    const list = hasActiveFilters ? filteredList : fullList

    if (mode === "select") {
      setSelectedBeds(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      return
    }

    if (bedId && list.length > 0) {
      setSelectedBedDetail({ bedKey: key, tasks: list })
      setDetailOpen(true)
    }
  }

  return (
    <div>
      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
        <div className="flex min-h-[88px] items-center justify-between gap-4 rounded-xl border bg-white px-5 py-4 shadow-sm">
          <Button onClick={() => changeWeek(-1)} type="button">
            ←
          </Button>

          <div className="flex-1 text-center">
            <h2 className="text-lg font-bold">Semana</h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(currentWeek.start_date)} → {formatDate(currentWeek.end_date)}
            </p>
          </div>

          <Button onClick={() => changeWeek(1)} type="button">
            →
          </Button>
        </div>

        <Button
          type="button"
          variant={hasActiveFilters ? "default" : "outline"}
          className="h-auto gap-2 px-5 py-4 lg:min-w-40"
          onClick={openFiltersModal}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount}</Badge>}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-2">
          {hasActiveFilters ? (
            <>
              {activeFilterBadges.map(filterLabel => (
                <Badge key={filterLabel} variant="outline" className="gap-1">
                  {filterLabel}
                </Badge>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Abre filtros para ver en el mapa solo camas que cumplan condiciones especificas.
            </p>
          )}
        </div>

      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem_12rem] lg:items-start">
        <div>
          {lastAssignedBatch && (
            <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm lg:max-w-sm">
              <p className="font-medium">Ultima asignacion</p>
              <p>
                {lastAssignedBatch.count} cama
                {lastAssignedBatch.count === 1 ? "" : "s"} Â·{" "}
                {taskLabels[lastAssignedBatch.taskType]}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => undoAssignMutation.mutate()}
                disabled={undoAssignMutation.isPending}
              >
                {undoAssignMutation.isPending
                  ? "Deshaciendo..."
                  : "Deshacer ultima asignacion"}
              </Button>
            </div>
          )}
        </div>

        <div className="w-full rounded border bg-white p-3 text-sm shadow">
          <p className="mb-2 font-semibold">
            {hasActiveFilters ? "Resumen filtrado" : "Resumen semana"}
          </p>

          <div className="space-y-1">
            <p>Camas con tareas: {summary.bedsWithTasks}</p>
            <p>Total tareas: {summary.totalTasks}</p>
            <p>Cumplidas: {summary.completed}</p>
            <p>Pendientes: {summary.pending}</p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setCreateTaskOpen(true)}
          className="h-auto min-h-16 w-full"
          variant="outline"
        >
          + Nueva tarea
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="w-full space-y-3 lg:w-44">
          {Object.entries(taskLabels).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode("view")
                setSelectedBeds(new Set())
                setTaskType(key as TaskType)
                setAssignDialogOpen(true)
              }}
              className="w-full rounded border p-2"
            >
              {label}
            </button>
          ))}

          {taskDefinitions.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                setMode("view")
                setSelectedBeds(new Set())
                setTaskType(task.task_type)
                setAssignDialogOpen(true)
              }}
              className="w-full rounded border bg-gray-50 p-2"
            >
              {task.name}
            </button>
          ))}


          {lastAssignedBatch && selectedBedDetail?.bedKey === "__hidden__" && (
            <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Ultima asignacion</p>
              <p>
                {lastAssignedBatch.count} cama
                {lastAssignedBatch.count === 1 ? "" : "s"} ·{" "}
                {taskLabels[lastAssignedBatch.taskType]}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => undoAssignMutation.mutate()}
                disabled={undoAssignMutation.isPending}
              >
                {undoAssignMutation.isPending
                  ? "Deshaciendo..."
                  : "Deshacer ultima asignacion"}
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto rounded border p-2">
          {Array.from({ length: rows }).map((_, rowIndex) => {
            if (rowIndex === middleRow) {
              return (
                <div key="camino" className="bg-gray-200 text-center">
                  Camino
                </div>
              )
            }

            return (
              <div key={rowIndex} className="flex gap-1">
                {Array.from({ length: columns }).map((_, columnIndex) => {
                  const key = `${rowIndex + 1}-${columnIndex + 1}`
                  const bedId = bedMap.get(key)
                  const fullList = bedId ? currentWeekBedTaskMap.get(bedId) ?? [] : []
                  const filteredList = bedId ? visibleBedTaskMap.get(bedId) ?? [] : []
                  const displayList = hasActiveFilters ? filteredList : fullList
                  const matchesFilters = bedId ? visibleBedIds.has(bedId) : false
                  const hiddenByFilter = hasActiveFilters && !matchesFilters

                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={hiddenByFilter}
                      onClick={() => handleClick(key)}
                      onMouseDown={() => setIsDragging(true)}
                      onMouseUp={() => setIsDragging(false)}
                      onMouseEnter={() => {
                        if (isDragging && mode === "select") handleClick(key)
                      }}
                      style={{ width: cellSize, height: cellSize }}
                      className={cn(
                        "rounded border transition-all",
                        getColor(displayList),
                        hiddenByFilter &&
                          "border-transparent bg-transparent opacity-10 shadow-none",
                        matchesFilters &&
                          hasActiveFilters &&
                          "ring-2 ring-sky-500 ring-offset-1",
                        selectedBeds.has(key) && "ring-2 ring-black ring-offset-1"
                      )}
                      title={key}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtros del mapa</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-3">
              <p className="text-sm font-medium">Ver camas con esta tarea especifica</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(taskLabels).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded border p-3 text-sm"
                  >
                    <Checkbox
                      checked={draftFilters.taskTypes.includes(key as TaskType)}
                      onCheckedChange={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          taskTypes: toggleArrayValue(prev.taskTypes, key as TaskType)
                        }))
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Estado de la tarea</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(statusLabels) as TaskStatus[]).map(status => (
                  <label
                    key={status}
                    className="flex items-center gap-2 rounded border p-3 text-sm"
                  >
                    <Checkbox
                      checked={draftFilters.statuses.includes(status)}
                      onCheckedChange={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          statuses: toggleArrayValue(prev.statuses, status)
                        }))
                      }
                    />
                    <span>{statusLabels[status]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="created-date">Tareas creadas el dia</Label>
                <Input
                  id="created-date"
                  type="date"
                  value={draftFilters.createdDate}
                  onChange={event =>
                    setDraftFilters(prev => ({
                      ...prev,
                      createdDate: event.target.value
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="completed-date">Tareas realizadas el dia</Label>
                <Input
                  id="completed-date"
                  type="date"
                  value={draftFilters.completedDate}
                  onChange={event =>
                    setDraftFilters(prev => ({
                      ...prev,
                      completedDate: event.target.value
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpiar todo
              </Button>
              <Button type="button" onClick={applyFilters}>
                Aplicar filtros
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar tarea</DialogTitle>
          </DialogHeader>

          <Textarea
            placeholder="Notas..."
            value={notes}
            onChange={event => setNotes(event.target.value)}
          />

          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              onClick={() => assignMutation.mutate(true)}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending ? "Asignando..." : "Todas"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={assignMutation.isPending}
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

      {mode === "select" && selectedBeds.size > 0 && (
        <div className="fixed bottom-6 right-6 z-50 rounded border bg-white p-4 shadow">
          <p>{selectedBeds.size} camas</p>
          <Button
            type="button"
            onClick={() => assignMutation.mutate(false)}
            disabled={assignMutation.isPending}
          >
            {assignMutation.isPending ? "Asignando..." : "Confirmar"}
          </Button>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Detalle {selectedBedDetail ? `de cama ${selectedBedDetail.bedKey}` : ""}
            </DialogTitle>
          </DialogHeader>

          {selectedBedDetail?.tasks?.length ? (
            selectedBedDetail.tasks.map(task => (
              <div key={task.id} className="mb-2 space-y-1 rounded border p-3">
                <p className="font-semibold capitalize">{taskLabels[task.task_type]}</p>

                <p className="text-sm text-gray-600">
                  Creada: {formatDateTime(task.created_at)}
                </p>

                {task.notes && (
                  <p className="text-sm italic text-gray-700">{task.notes}</p>
                )}

                {task.status === "completed" ? (
                  <>
                    <p className="font-semibold text-green-600">Completada</p>
                    {task.completed_at && (
                      <p className="text-xs text-gray-500">
                        {formatDateTime(task.completed_at)}
                      </p>
                    )}
                  </>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={completeMutation.isPending}
                    onClick={() => completeMutation.mutate(task.id)}
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

      <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>

          <Input
            placeholder="Ej: pintar hojas"
            value={newTaskName}
            onChange={event => setNewTaskName(event.target.value)}
          />

          <Button
            type="button"
            className="mt-4 w-full"
            onClick={async () => {
              if (!newTaskName.trim()) {
                toast({ title: "Ponle nombre a la tarea" })
                return
              }

              const { error } = await supabase.from("task_definitions").insert({
                name: newTaskName.trim(),
                task_type: "cortar",
                is_permanent: true,
                start_week: weekStart,
                end_week: weekStart
              })

              if (error) {
                console.error(error)
                toast({
                  title: "Error",
                  description: error.message
                })
                return
              }

              toast({ title: "Tarea creada" })
              setCreateTaskOpen(false)
              setNewTaskName("")

              queryClient.invalidateQueries({
                queryKey: ["task-definitions"]
              })
            }}
          >
            Guardar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
