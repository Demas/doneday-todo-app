import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlarmClock, ArrowUpDown, BellRing, Cake, CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Download, Filter, Folder, GripVertical, LayoutDashboard, ListTodo, MoreHorizontal, Plus, Search, Settings as SettingsIcon, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { addDays, createTask, DEFAULT_DATA, isOverdue, localDate, nextRecurrenceDate, parseData, STORAGE_KEY, type AppData, type Category, type Priority, type Recurrence, type Task } from './domain'
import { BirthdaysView, PlannerView, RemindersView } from './PlanningViews'
import { useReminderScheduler, type DueReminder } from './reminders'
import { useCloudSync } from './cloud'
import { CloudAccount } from './CloudAccount'
import { PushSetup } from './PushSetup'
import { greetingFor, shouldShowWelcome } from './personalization'
import { WelcomeScreen } from './WelcomeScreen'
import { cloudConfigured } from './supabase'

type View = 'dashboard' | 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'categories' | 'planner' | 'birthdays' | 'reminders' | 'settings'
const viewLabels: Record<View, string> = { dashboard: 'Dashboard', all: 'My Tasks', today: 'Today', upcoming: 'Upcoming', overdue: 'Overdue', completed: 'Completed', categories: 'Lists', planner: 'Daily Planner', birthdays: 'Birthdays', reminders: 'Reminders', settings: 'Settings' }
const iconFor: Record<View, typeof LayoutDashboard> = { dashboard: LayoutDashboard, all: ListTodo, today: CalendarDays, upcoming: Clock3, overdue: AlarmClock, completed: CheckCheck, categories: Folder, planner: CalendarDays, birthdays: Cake, reminders: BellRing, settings: SettingsIcon }
const fmtDate = (iso: string) => { if (!iso) return ''; const today = localDate(); if (iso === today) return 'Today'; if (iso === addDays(today, 1)) return 'Tomorrow'; return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }

function useAppData() {
  const [data, setData] = useState(() => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? parseData(raw) : DEFAULT_DATA } catch { return DEFAULT_DATA } })
  const [storageError, setStorageError] = useState('')
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setStorageError('') } catch { setStorageError('Could not save your changes. Your browser storage may be full.') } }, [data])
  return { data, setData, storageError }
}

function TaskEditor({ task, categories, onClose, onSave }: { task: Task | null; categories: Category[]; onClose: () => void; onSave: (task: Task) => void }) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(task?.dueTime ?? '')
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium')
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? categories[0]?.id ?? 'other')
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '')
  const [reminder, setReminder] = useState(task?.reminder ?? false)
  const [reminderOffsets, setReminderOffsets] = useState<Task['reminderOffsets']>(task?.reminderOffsets ?? [0])
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'none')
  const [subtasks, setSubtasks] = useState(task?.subtasks.map(s => s.title).join('\n') ?? '')
  const [titleError, setTitleError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    titleRef.current?.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = document.querySelectorAll<HTMLElement>('[role="dialog"] button:not([disabled]), [role="dialog"] input:not([disabled]), [role="dialog"] textarea:not([disabled]), [role="dialog"] select:not([disabled])')
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trapFocus)
    return () => { document.removeEventListener('keydown', trapFocus); previousFocus?.focus() }
  }, [])
  const submit = (e: FormEvent) => {
    e.preventDefault(); if (!title.trim()) { setTitleError('Please enter a task name.'); titleRef.current?.focus(); return }
    setTitleError('')
    const base = task ?? createTask({ title: title.trim() })
    onSave({ ...base, title: title.trim(), description: description.trim(), dueDate, dueTime, priority, categoryId, tags: tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean).slice(0, 20), reminder, reminderOffsets, recurrence, subtasks: subtasks.split('\n').map(t => t.trim()).filter(Boolean).map((t, i) => ({ id: base.subtasks[i]?.id ?? crypto.randomUUID(), title: t.slice(0, 120), completed: base.subtasks.find(s => s.title === t)?.completed ?? false })), updatedAt: new Date().toISOString() })
  }
  return <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header className="dialog-head"><div><span className="eyebrow">MAKE IT HAPPEN</span><h2 id="editor-title">{task ? 'Edit task' : 'New task'}</h2></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></header><form onSubmit={submit} className="editor-form"><label className="field">Task name<input ref={titleRef} required maxLength={160} aria-invalid={titleError ? 'true' : 'false'} aria-describedby={titleError ? 'title-error' : undefined} placeholder="What needs to get done?" value={title} onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError('') }} />{titleError&&<span className="inline-error" id="title-error">{titleError}</span>}</label><label className="field">A little more detail <span className="optional">Optional</span><textarea rows={2} maxLength={1000} placeholder="Add a note or some context…" value={description} onChange={e => setDescription(e.target.value)} /></label><div className="form-grid"><label className="field">Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label className="field">Time<input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} /></label><label className="field">Priority<select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="field">List<select value={categoryId} onChange={e => setCategoryId(e.target.value)}>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label></div><label className="field">Tags <span className="optional">Separate with commas</span><input value={tags} onChange={e => setTags(e.target.value)} placeholder="home, important" /></label><label className="field">Subtasks <span className="optional">One per line</span><textarea rows={2} value={subtasks} onChange={e => setSubtasks(e.target.value)} placeholder={'Gather materials\nGet started'} /></label><div className="form-grid bottom-options"><label className="field">Repeat<select value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label><fieldset className="reminder-offsets"><legend>Task alarm</legend><label className="check-field"><input type="checkbox" checked={reminder} onChange={e => setReminder(e.target.checked)} /> Enable reminders</label>{reminder && <div>{([0,5,10,30,60,1440] as const).map(offset => <label key={offset}><input type="checkbox" checked={reminderOffsets.includes(offset)} onChange={e => setReminderOffsets(current => e.target.checked ? [...new Set([...current, offset])] : current.filter(item => item !== offset))}/>{offset === 0 ? 'At task time' : offset === 60 ? '1 hour before' : offset === 1440 ? '1 day before' : `${offset} minutes before`}</label>)}</div>}</fieldset></div><footer className="dialog-actions"><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="submit">{task ? 'Save changes' : 'Add task'}</button></footer></form></section></div>
}

function App() {
  const { data, setData, storageError } = useAppData()
  const cloud = useCloudSync(data, setData)
  const [guestChoice, setGuestChoice] = useState(() => localStorage.getItem('doneday-welcome-choice') === 'guest')
  const [hasExistingLocalData] = useState(() => Boolean(localStorage.getItem(STORAGE_KEY)))
  const [view, setView] = useState<View>('dashboard')
  const [categoryView, setCategoryView] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('date')
  const [editor, setEditor] = useState<Task | null | undefined>(undefined)
  const [quick, setQuick] = useState('')
  const [toast, setToast] = useState('')
  const [undoTask, setUndoTask] = useState<Task | null>(null)
  const [newList, setNewList] = useState('')
  const [importError, setImportError] = useState('')
  const [activeReminder, setActiveReminder] = useState<DueReminder | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const today = localDate()
  const allTasks = data.tasks
  const pending = allTasks.filter(t => !t.completed)
  const todayTasks = allTasks.filter(t => t.dueDate === today)
  const todayPending = todayTasks.filter(t => !t.completed)
  const overdueTasks = pending.filter(t => isOverdue(t, today))
  const completed = allTasks.filter(t => t.completed)
  const completion = allTasks.length ? Math.round(completed.length / allTasks.length * 100) : 0
  const selectedCategory = data.categories.find(c => c.id === categoryView)
  const navView = (next: View) => { setView(next); setCategoryView(''); setQuery('') }
  const say = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200) }
  const saveTask = (task: Task) => { setData(d => ({ ...d, tasks: d.tasks.some(t => t.id === task.id) ? d.tasks.map(t => t.id === task.id ? task : t) : [...d.tasks, task] })); setEditor(undefined); setQuick(''); say(task.completed ? 'Nice work! Task completed.' : 'Task saved') }
  const addQuick = (e: FormEvent) => { e.preventDefault(); if (quick.trim()) saveTask(createTask({ title: quick.trim(), dueDate: view === 'today' || view === 'dashboard' ? today : '' })) }
  const toggleTask = (task: Task) => {
    if (!task.completed && task.recurrence !== 'none') { const nextDate = nextRecurrenceDate(task.dueDate, task.recurrence); setData(d => ({ ...d, tasks: [...d.tasks.map(t => t.id === task.id ? { ...t, completed: true, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : t), createTask({ ...task, id: undefined, title: task.title, completed: false, dueDate: nextDate, completedAt: '', createdAt: new Date().toISOString(), subtasks: task.subtasks.map(s => ({ ...s, id: crypto.randomUUID(), completed: false })), order: Date.now() })] })); say('Task completed · next one scheduled') }
    else setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : '', updatedAt: new Date().toISOString() } : t) }))
  }
  const deleteTask = (task: Task) => { if (data.settings.confirmDelete && !window.confirm(`Delete “${task.title}”?`)) return; setUndoTask(task); setData(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== task.id) })); say('Task deleted') }
  const undoDelete = () => { if (undoTask) setData(d => ({ ...d, tasks: [...d.tasks, undoTask] })); setUndoTask(null); setToast('Task restored') }
  const setSubtask = (task: Task, id: string) => setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, subtasks: t.subtasks.map(s => s.id === id ? { ...s, completed: !s.completed } : s) } : t) }))
  const reorderTasks = (fromId: string, toId: string) => { if (fromId === toId) return; setData(d => { const ordered = [...d.tasks].sort((a,b)=>a.order-b.order); const from = ordered.findIndex(t=>t.id===fromId); const to = ordered.findIndex(t=>t.id===toId); if(from<0||to<0)return d; const [moved] = ordered.splice(from,1); ordered.splice(to,0,moved); const orders = new Map(ordered.map((t,i)=>[t.id,i])); return {...d,tasks:d.tasks.map(t=>({...t,order:orders.get(t.id)??t.order}))} }); setSort('manual') }
  useReminderScheduler(data.tasks, data.settings.reminders, data.settings.sound, reminder => { setActiveReminder(reminder); say(`Reminder: ${reminder.message}`) })
  const visibleTasks = useMemo(() => {
    let list = [...allTasks]
    if (categoryView) list = list.filter(t => t.categoryId === categoryView)
    else if (view === 'today') list = list.filter(t => t.dueDate === today || isOverdue(t, today))
    else if (view === 'upcoming') list = list.filter(t => !t.completed && t.dueDate > today)
    else if (view === 'overdue') list = list.filter(t => isOverdue(t, today))
    else if (view === 'completed') list = list.filter(t => t.completed)
    else if (view === 'all') list = list.filter(t => !t.completed)
    if (filter === 'pending') list = list.filter(t => !t.completed)
    if (filter === 'completed') list = list.filter(t => t.completed)
    if (filter === 'high') list = list.filter(t => t.priority === 'high' || t.priority === 'urgent')
    if (filter === 'low') list = list.filter(t => t.priority === 'low')
    if (query.trim()) { const q = query.toLocaleLowerCase(); list = list.filter(t => `${t.title} ${t.description} ${t.tags.join(' ')} ${data.categories.find(c => c.id === t.categoryId)?.name ?? ''}`.toLocaleLowerCase().includes(q)) }
    return list.sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'priority' ? ['urgent','high','medium','low'].indexOf(a.priority) - ['urgent','high','medium','low'].indexOf(b.priority) : sort === 'created' ? b.createdAt.localeCompare(a.createdAt) : sort === 'manual' ? a.order - b.order : (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.order - b.order)
  }, [allTasks, categoryView, view, today, filter, query, sort, data.categories])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { const target = e.target as HTMLElement; const typing = ['INPUT','TEXTAREA','SELECT'].includes(target.tagName) || target.isContentEditable; if (e.key === 'Escape') setEditor(undefined); if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === 'n') { e.preventDefault(); setEditor(null) } if (!typing && e.key === '/') { e.preventDefault(); document.getElementById('search-input')?.focus() } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])

  const title = categoryView ? selectedCategory?.name ?? 'List' : viewLabels[view]
  const contentTasks = view === 'dashboard' ? [...todayTasks].filter(t => { const q = query.trim().toLocaleLowerCase(); return !q || `${t.title} ${t.description} ${t.tags.join(' ')} ${data.categories.find(c=>c.id===t.categoryId)?.name ?? ''}`.toLocaleLowerCase().includes(q) }).sort((a,b) => (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99') || a.order-b.order).slice(0, 5) : visibleTasks
  const completeAll = () => { if (window.confirm('Permanently clear all completed tasks? This cannot be undone.')) { setData(d => ({ ...d, tasks: d.tasks.filter(t => !t.completed) })); say('Completed tasks cleared') } }
  const exportData = (format: 'json' | 'csv') => {
    const content = format === 'json' ? JSON.stringify(data, null, 2) : ['Title,Description,Due date,Due time,Priority,List,Completed,Tags', ...data.tasks.map(t => [t.title,t.description,t.dueDate,t.dueTime,t.priority,data.categories.find(c=>c.id===t.categoryId)?.name ?? '',t.completed,t.tags.join('; ')].map(x => `"${String(x).replaceAll('"','""')}"`).join(','))].join('\n')
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `doneday-tasks.${format}`; a.click(); URL.revokeObjectURL(a.href)
  }
  const importData = async (file?: File) => { if (!file) return; try { const incoming = parseData(await file.text()); if (data.tasks.length && !window.confirm(`Import ${incoming.tasks.length} tasks and ${incoming.categories.length} lists? This will replace current data.`)) return; setData(incoming); setImportError(''); say('Backup imported') } catch (e) { setImportError(e instanceof Error ? e.message : 'Could not read this file.') } finally { if (fileRef.current) fileRef.current.value = '' } }

  const firstVisit = shouldShowWelcome({ cloudReady: cloudConfigured, isGuest: cloud.status === 'guest', hasUser: Boolean(cloud.userId), hasGuestChoice: guestChoice, hasExistingLocalData })
  if (firstVisit) return <><WelcomeScreen onCreateAccount={() => window.dispatchEvent(new CustomEvent('doneday-account-open', { detail: 'sign-up' }))} onSignIn={() => window.dispatchEvent(new CustomEvent('doneday-account-open', { detail: 'sign-in' }))} onContinueGuest={() => { localStorage.setItem('doneday-welcome-choice', 'guest'); setGuestChoice(true) }}/><CloudAccount status={cloud.status} userId={cloud.userId} onImport={cloud.importLocal} showTrigger={false}/></>
  const dashboardGreeting = greetingFor(new Date(), cloud.profile.displayName)

  return <div className={`app-shell ${data.settings.density}`}>
    <aside className="sidebar"><button className="brand" onClick={() => navView('dashboard')}><span className="brand-mark"><Check size={21} strokeWidth={3}/></span><span>DoneDay<small>MAKE TODAY COUNT</small></span></button><div className="nav-label">WORKSPACE</div><nav className="nav-list" aria-label="Main navigation">{(['dashboard','all','today','planner','birthdays','reminders','upcoming','overdue','completed'] as View[]).map(v => { const Icon = iconFor[v]; const count = v === 'today' ? todayTasks.length : v === 'overdue' ? overdueTasks.length : v === 'completed' ? completed.length : v === 'all' ? pending.length : v === 'birthdays' ? data.birthdays.length : 0; return <button key={v} className={`nav-item ${view === v && !categoryView ? 'active' : ''}`} onClick={() => navView(v)}><Icon size={18}/><span>{viewLabels[v]}</span>{count > 0 && <b className={`nav-count ${v==='overdue'?'red':''}`}>{count}</b>}</button> })}</nav><div className="nav-separator"/><div className="nav-label list-label">YOUR LISTS <button className="tiny-icon" onClick={() => navView('categories')} aria-label="Manage lists"><Plus size={16}/></button></div><nav className="nav-list category-nav">{data.categories.slice(0,5).map(c => <button key={c.id} onClick={() => { setCategoryView(c.id); setQuery('') }} className={`nav-item ${categoryView===c.id?'active':''}`}><span className="category-dot" style={{backgroundColor:c.color}}/><span>{c.name}</span><span className="nav-count">{pending.filter(t=>t.categoryId===c.id).length}</span></button>)}{data.categories.length===0 && <p className="muted mini">Create a list to get organized.</p>}</nav><div className="sidebar-bottom"><div className="streak-card"><div className="streak-icon"><Sparkles size={18}/></div><div><strong>You're doing great!</strong><span>{completion}% of tasks complete</span></div><div className="mini-progress"><i style={{width:`${completion}%`}}/></div></div><button className={`nav-item ${view==='settings'?'active':''}`} onClick={()=>navView('settings')}><SettingsIcon size={18}/><span>Settings</span></button><div className="profile-row"><div className="avatar">D</div><div><strong>Your workspace</strong><small>Personal account</small></div><MoreHorizontal size={19}/></div></div></aside>
    <main className="main-area"><header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Check size={17} strokeWidth={3}/></span> DoneDay</div><div className="breadcrumbs">Workspace <span>/</span> <strong>{title}</strong></div><div className="header-actions"><label className="search-box"><Search size={17}/><input id="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search anything…"/><kbd>/</kbd></label><button className="btn primary header-add" onClick={()=>setEditor(null)}><Plus size={18}/> Add task <kbd>N</kbd></button></div></header>
      <div className="page-content">{view==='dashboard'&&!categoryView ? <>
        <section className="welcome-row"><div><div className="eyebrow">{new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}).toUpperCase()}</div><h1>{dashboardGreeting}</h1><p>Let's make today productive. One task at a time.</p></div><div className="today-progress"><div className="progress-copy"><span>Today's progress</span><strong>{todayTasks.filter(t=>t.completed).length}<small> / {todayTasks.length}</small></strong></div><div className="progress-track"><i style={{width:`${todayTasks.length?todayTasks.filter(t=>t.completed).length/todayTasks.length*100:0}%`}}/></div><span className="progress-note">{todayTasks.length===0?'Your day is clear 🎉':'You’ve got this!'}</span></div></section>
        <section className="stats-grid"><Stat icon={<CalendarDays size={19}/>} label="Due today" value={todayPending.length} accent="yellow" hint="Ready for today"/><Stat icon={<CheckCheck size={19}/>} label="Completed" value={completed.length} accent="green" hint="All time wins"/><Stat icon={<ListTodo size={19}/>} label="Pending" value={pending.length} accent="blue" hint="Still on your list"/><Stat icon={<AlarmClock size={19}/>} label="Overdue" value={overdueTasks.length} accent="red" hint="Let’s get back on track"/></section>
        <section className="dashboard-grid"><div className="panel today-panel"><div className="section-heading"><div><div className="eyebrow">YOUR DAY</div><h2>Today's tasks <span className="pill-count">{todayPending.length}</span></h2></div><button className="text-link" onClick={()=>navView('today')}>See all <span>→</span></button></div><form className="quick-add" onSubmit={addQuick}><Plus size={18}/><input aria-label="Quick add task" value={quick} onChange={e=>setQuick(e.target.value)} placeholder="Add a task and press Enter…"/><button aria-label="Submit quick task" type="submit"><Plus size={18}/></button></form><TaskList tasks={contentTasks} categories={data.categories} onToggle={toggleTask} onEdit={t=>setEditor(t)} onDelete={deleteTask} onSubtask={setSubtask} onReorder={reorderTasks}/>{contentTasks.length===0&&<Empty icon={<CheckCheck size={25}/>} title="Your day is clear" text="Enjoy the breathing room, or add a task to get started."/>}</div><aside className="panel focus-panel"><div className="focus-top"><div className="focus-symbol"><Sparkles size={21}/></div><div><div className="eyebrow">A LITTLE MOMENTUM</div><h3>Small steps add up.</h3></div></div><p>Every task you finish is progress. Keep going at your own pace.</p><div className="focus-metric"><span>Overall completion</span><strong>{completion}%</strong></div><div className="progress-track"><i style={{width:`${completion}%`}}/></div><button className="btn light full" onClick={()=>navView('all')}>View my tasks <span>→</span></button><div className="up-next"><div className="eyebrow">COMING UP</div>{pending.filter(t=>t.dueDate>today).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,2).map(t=><div className="up-next-row" key={t.id}><span className="small-dot"/><span>{t.title}</span><time>{fmtDate(t.dueDate)}</time></div>)}{pending.filter(t=>t.dueDate>today).length===0&&<div className="muted mini">Nothing on the horizon yet.</div>}</div></aside></section>
      </> : view==='planner' ? <PlannerView data={data} setData={setData} onToggle={toggleTask}/>
      : view==='birthdays' ? <BirthdaysView data={data} setData={setData}/>
      : view==='reminders' ? <RemindersView data={data} setData={setData} onToggle={toggleTask}/>
      : view==='settings' ? <Settings data={data} setData={setData} onExport={exportData} onImport={()=>fileRef.current?.click()} onClear={()=>{if(window.confirm('Delete all tasks and restore default lists? This cannot be undone.')){setData(DEFAULT_DATA);say('All data cleared')}}} importError={importError}/>
      : view==='categories'&&!categoryView ? <section className="page-section"><div className="page-intro"><div className="eyebrow">STAY ORGANIZED</div><h1>Your lists</h1><p>Give your tasks a place to belong.</p></div><div className="panel categories-panel"><form className="new-list-form" onSubmit={e=>{e.preventDefault(); const name=newList.trim();if(name&&!data.categories.some(c=>c.name.toLowerCase()===name.toLowerCase())){setData(d=>({...d,categories:[...d.categories,{id:crypto.randomUUID(),name,color:['#facc15','#7c9cf5','#f4a261','#a78bfa','#7bc8a4'][d.categories.length%5]}]}));setNewList('');say('List created')} }}><input value={newList} onChange={e=>setNewList(e.target.value)} placeholder="Name your new list…" aria-label="New list name"/><button className="btn primary"><Plus size={17}/> Create list</button></form>{data.categories.map(c=><div className="category-row" key={c.id}><span className="category-dot" style={{background:c.color}}/><strong>{c.name}</strong><span className="muted">{allTasks.filter(t=>t.categoryId===c.id).length} tasks</span><button className="icon-btn" title={`Rename ${c.name}`} onClick={()=>{const name=window.prompt('Rename list',c.name)?.trim();if(name)setData(d=>({...d,categories:d.categories.map(x=>x.id===c.id?{...x,name}:x)}))}}>✎</button><button className="icon-btn danger-icon" title={`Delete ${c.name}`} onClick={()=>{if(window.confirm(`Delete “${c.name}”? Its tasks will move to another list.`)){const remaining=data.categories.filter(x=>x.id!==c.id);const fallback=remaining.find(x=>x.id==='other')??remaining[0]??{id:'other',name:'Other',color:'#94a3b8'};setData(d=>({...d,categories:remaining.length?remaining:[fallback],tasks:d.tasks.map(t=>t.categoryId===c.id?{...t,categoryId:fallback.id}:t)}));say('List deleted; tasks kept')}}}><Trash2 size={16}/></button></div>)}</div></section>
      : <section className="page-section"><div className="page-intro list-intro"><div><div className="eyebrow">{categoryView?'YOUR LIST':view==='overdue'?'A FRESH START':view==='upcoming'?'LOOKING AHEAD':'YOUR TASKS'}</div><h1>{title}</h1><p>{view==='overdue'?'You have a few things to catch up on. One step at a time.':view==='today'?'Here’s what’s on your plate today.':view==='upcoming'?'Your future plans, all in one place.':view==='completed'?'Look at everything you’ve accomplished.':'Keep your plans moving forward.'}</p></div>{view==='completed'&&completed.length>0&&<button className="btn secondary" onClick={completeAll}><Trash2 size={16}/> Clear completed</button>}</div><div className="panel tasks-panel"><div className="list-toolbar"><span>{visibleTasks.length} {visibleTasks.length===1?'task':'tasks'}</span><div className="toolbar-controls"><label><Filter size={15}/><select aria-label="Filter tasks" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All tasks</option><option value="pending">Pending</option><option value="completed">Completed</option><option value="high">High priority</option><option value="low">Low priority</option></select><ChevronDown size={13}/></label><label><ArrowUpDown size={15}/><select aria-label="Sort tasks" value={sort} onChange={e=>setSort(e.target.value)}><option value="date">Due date</option><option value="priority">Priority</option><option value="created">Created date</option><option value="name">Alphabetical</option><option value="manual">Manual order</option></select><ChevronDown size={13}/></label></div></div><TaskList tasks={visibleTasks} categories={data.categories} onToggle={toggleTask} onEdit={t=>setEditor(t)} onDelete={deleteTask} onSubtask={setSubtask} onReorder={reorderTasks}/>{visibleTasks.length===0&&<Empty icon={<Search size={24}/>} title={query?'No tasks found':'Nothing here yet'} text={query?'Try another search, or clear the search field.':view==='completed'?'Complete a task and it will show up here.':'Add a task and it will appear here.'}/>}</div></section>}
      </div>
    </main>
    <CloudAccount status={cloud.status} userId={cloud.userId} onImport={cloud.importLocal}/>
    {cloud.userId && <PushSetup/>}
    <nav className="mobile-nav" aria-label="Mobile navigation">{(['dashboard','today','planner','birthdays'] as View[]).map(v=>{const Icon=iconFor[v];return <button key={v} className={view===v&&!categoryView?'selected':''} onClick={()=>navView(v)} aria-label={viewLabels[v]}><Icon size={20}/><small>{viewLabels[v]}</small></button>})}<details className={`mobile-more ${['all','upcoming','overdue','completed','categories','reminders','settings'].includes(view)?'selected':''}`}><summary aria-label="More navigation"><MoreHorizontal size={20}/><small>More</small></summary><div className="mobile-more-menu">{(['all','upcoming','overdue','completed','categories','reminders','settings'] as View[]).map(v=>{const Icon=iconFor[v];return <button key={v} className={view===v?'selected':''} onClick={e=>{navView(v);e.currentTarget.closest('details')?.removeAttribute('open')}}><Icon size={17}/>{viewLabels[v]}</button>})}</div></details></nav><button className="mobile-fab" onClick={()=>setEditor(null)} aria-label="Add task"><Plus size={24}/></button>
    {editor!==undefined&&<TaskEditor task={editor} categories={data.categories.length?data.categories:DEFAULT_DATA.categories} onClose={()=>setEditor(undefined)} onSave={saveTask}/>}<input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e=>void importData(e.target.files?.[0])}/>{activeReminder&&<div className="alarm-popover" role="alertdialog" aria-label="Task reminder"><BellRing size={20}/><div><strong>{activeReminder.task.title}</strong><p>{activeReminder.message}</p></div><button className="btn secondary small" onClick={()=>{setData(d=>({...d,tasks:d.tasks.map(t=>t.id===activeReminder.task.id?{...t,snoozeUntil:new Date(Date.now()+5*60000).toISOString()}:t)}));setActiveReminder(null)}}>Snooze 5m</button><button className="btn secondary small" onClick={()=>{setData(d=>({...d,tasks:d.tasks.map(t=>t.id===activeReminder.task.id?{...t,snoozeUntil:new Date(Date.now()+15*60000).toISOString()}:t)}));setActiveReminder(null)}}>Snooze 15m</button><button className="btn primary small" onClick={()=>{toggleTask(activeReminder.task);setActiveReminder(null)}}>Complete</button><button className="icon-btn" aria-label="Dismiss reminder" onClick={()=>setActiveReminder(null)}><X size={16}/></button></div>}{toast&&<div className="toast" role="status"><Check size={17}/>{toast}{undoTask&&toast==='Task deleted'&&<button onClick={undoDelete}><Undo2 size={15}/> Undo</button>}<button className="toast-close" aria-label="Dismiss" onClick={()=>{setToast('');setUndoTask(null)}}><X size={16}/></button></div>}{storageError&&<div className="storage-error" role="alert">{storageError}</div>}
  </div>
}

function Stat({icon,label,value,accent,hint}:{icon:React.ReactNode;label:string;value:number;accent:string;hint:string}){return <article className="stat-card"><div className={`stat-icon ${accent}`}>{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-hint">{hint}</span></article>}
function Empty({icon,title,text}:{icon:React.ReactNode;title:string;text:string}){return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p></div>}
function TaskList({tasks,categories,onToggle,onEdit,onDelete,onSubtask,onReorder}:{tasks:Task[];categories:Category[];onToggle:(t:Task)=>void;onEdit:(t:Task)=>void;onDelete:(t:Task)=>void;onSubtask:(t:Task,id:string)=>void;onReorder:(from:string,to:string)=>void}){return <div className="task-list">{tasks.map(task=>{const cat=categories.find(c=>c.id===task.categoryId); const doneSubs=task.subtasks.filter(s=>s.completed).length;return <article className={`task-row ${task.completed?'is-done':''} ${isOverdue(task)?'is-overdue':''}`} key={task.id} draggable onDragStart={e=>{e.dataTransfer.setData('text/plain',task.id);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}} onDrop={e=>{e.preventDefault();onReorder(e.dataTransfer.getData('text/plain'),task.id)}}><button className={`task-check ${task.completed?'checked':''}`} aria-label={task.completed?`Mark ${task.title} incomplete`:`Complete ${task.title}`} onClick={()=>onToggle(task)}>{task.completed&&<Check size={14}/>}</button><div className="task-main"><button className="task-title" onClick={()=>onEdit(task)}>{task.title}</button>{task.description&&<p className="task-description">{task.description}</p>}<div className="task-meta">{task.dueDate&&<span className={`due-chip ${isOverdue(task)?'late':''}`}><CalendarDays size={13}/>{fmtDate(task.dueDate)} {task.dueTime&&`· ${task.dueTime}`}</span>}{cat&&<span className="category-chip"><i style={{background:cat.color}}/>{cat.name}</span>}{task.tags.map(tag=><span className="tag-chip" key={tag}>#{tag}</span>)}{task.reminder&&<span title="Reminder set"><AlarmClock size={14}/></span>}{task.recurrence!=='none'&&<span className="repeat-chip">↻ {task.recurrence}</span>}{task.subtasks.length>0&&<span className="subtask-count">{doneSubs}/{task.subtasks.length} subtasks</span>}</div>{task.subtasks.length>0&&<div className="subtask-inline">{task.subtasks.map(s=><label key={s.id}><input type="checkbox" checked={s.completed} onChange={()=>onSubtask(task,s.id)}/><span className={s.completed?'sub-done':''}>{s.title}</span></label>)}</div>}</div><span className={`priority-badge ${task.priority}`}>{task.priority}</span><details className="task-menu"><summary aria-label={`Actions for ${task.title}`}><MoreHorizontal size={19}/></summary><div className="menu-pop"><button onClick={()=>onEdit(task)}>Edit task</button><button onClick={()=>onToggle(task)}>{task.completed?'Mark pending':'Mark complete'}</button><button onClick={()=>onEdit({...task,id:crypto.randomUUID(),title:`${task.title} (copy)`,completed:false,completedAt:''})}>Duplicate</button><button className="danger-text" onClick={()=>onDelete(task)}>Delete</button></div></details><GripVertical className="drag-handle" size={16} aria-hidden="true"/></article>})}</div>}
function Settings({data,setData,onExport,onImport,onClear,importError}:{data:AppData;setData:React.Dispatch<React.SetStateAction<AppData>>;onExport:(format:'json'|'csv')=>void;onImport:()=>void;onClear:()=>void;importError:string}) {
  const toggleReminders = async () => {
    if (data.settings.reminders) {
      setData(d => ({ ...d, settings: { ...d.settings, reminders: false } }))
      return
    }
    if (!('Notification' in window)) { alert('Notifications are not available in this browser.'); return }
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') setData(d => ({ ...d, settings: { ...d.settings, reminders: true } }))
      else alert('Notifications were not enabled. You can change this in browser settings.')
    } catch {
      alert('Could not enable notifications. Check your browser settings and try again.')
    }
  }
  return <section className="page-section">
    <div className="page-intro"><div className="eyebrow">MAKE IT YOURS</div><h1>Settings</h1><p>A few things to make DoneDay feel right for you.</p></div>
    <div className="settings-grid">
      <div className="panel settings-panel">
        <h2>Task preferences</h2>
        <SettingRow title="Task density" detail="Choose how much breathing room task rows get."><select aria-label="Task density" value={data.settings.density} onChange={e=>setData(d=>({...d,settings:{...d.settings,density:e.target.value as 'comfortable'|'compact'}}))}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></SettingRow>
        <SettingRow title="Confirm before deleting" detail="Ask before removing a task permanently."><input aria-label="Confirm before deleting" type="checkbox" checked={data.settings.confirmDelete} onChange={e=>setData(d=>({...d,settings:{...d.settings,confirmDelete:e.target.checked}}))}/></SettingRow>
        <SettingRow title="Reminder notifications" detail="Allow DoneDay to show browser reminders."><button className="btn secondary small" aria-pressed={data.settings.reminders} onClick={toggleReminders}>{data.settings.reminders?'Disable':'Enable'}</button></SettingRow>
        <SettingRow title="Reminder sound" detail="Play a gentle sound for in-app alarms when the browser permits it."><input aria-label="Reminder sound" type="checkbox" checked={data.settings.sound} onChange={event=>setData(d=>({...d,settings:{...d.settings,sound:event.target.checked}}))}/></SettingRow>
        <SettingRow title="Feb 29 birthday policy" detail="Choose the annual date used in non-leap years."><select aria-label="February 29 birthday policy" value={data.settings.leapDayPolicy} onChange={event=>setData(d=>({...d,settings:{...d.settings,leapDayPolicy:event.target.value as 'feb28'|'mar1'}}))}><option value="feb28">February 28</option><option value="mar1">March 1</option></select></SettingRow>
        <p className="keyboard-hint"><CircleHelp size={16}/> Shortcuts: <kbd>N</kbd> new task · <kbd>/</kbd> search · <kbd>Esc</kbd> close</p>
      </div>
      <div className="panel settings-panel">
        <h2>Your data</h2><p className="panel-desc">Your tasks are saved on this device. Export a backup whenever you like.</p>
        <div className="setting-buttons"><button className="btn secondary" onClick={()=>onExport('json')}><Download size={16}/> Export JSON</button><button className="btn secondary" onClick={()=>onExport('csv')}><Download size={16}/> Export CSV</button><button className="btn secondary" onClick={onImport}>Import JSON</button></div>
        {importError&&<p role="alert" className="inline-error">{importError}</p>}
        <div className="about-card"><span className="brand-mark"><Check size={17} strokeWidth={3}/></span><div><strong>DoneDay</strong><small>Version 1.0 · Your plans, your pace.</small></div></div>
        <button className="btn danger-outline" onClick={onClear}><Trash2 size={16}/> Clear all data</button>
      </div>
    </div>
  </section>
}
function SettingRow({title,detail,children}:{title:string;detail:string;children:React.ReactNode}){return <div className="setting-row"><div><strong>{title}</strong><p>{detail}</p></div>{children}</div>}
export default App
