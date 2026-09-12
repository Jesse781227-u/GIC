import React, {useEffect, useState} from 'react'
import {
  LayoutDashboard, Users, CalendarDays, MessageSquare, Settings as SettingsIcon, FileText,
  Activity, ChevronDown, ChevronRight, Plus, Search, Filter, Download,
  MoreHorizontal, UserPlus, Send, Bell, CalendarPlus, ClipboardList,
  BarChart3, Shield, Database, Globe, Lock, CheckCircle2,
  Clock3, Eye, Edit3, Trash2, X, ArrowLeft, Save, Menu, LogOut
} from 'lucide-react'
import {Link, Routes, Route, useLocation, useNavigate, useParams} from 'react-router-dom'
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell} from 'recharts'
import {adminAuth} from './firebase'
import {onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'firebase/auth'

const purple='#4b20b5'
const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'

async function fetchAdminApi(path, options = {}) {
 const user = adminAuth.currentUser
 if (!user) throw new Error('Admin session is unavailable')
 const token = await user.getIdToken()
 const response = await fetch(`${API_BASE}${path}`, {
  ...options,
  headers: {'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(options.headers || {})},
 })
 if (!response.ok) throw new Error(await response.text().catch(()=>'Request failed'))
 return response.json()
}

const onboardingGrowthData=[{d:'Mon',v:220},{d:'Tue',v:410},{d:'Wed',v:430},{d:'Thu',v:700},{d:'Fri',v:780},{d:'Sat',v:1050},{d:'Sun',v:1580}]
const members=[
 ['John Doe','+234 801 234 5678','Youth, Media','Active','May 18, 2024'],
 ['Sarah Johnson','+234 803 456 7890','Choir','Active','May 18, 2024'],
 ['Michael Brown','+234 806 789 0123',"Men's Fellowship",'Active','May 15, 2024'],
 ['Esther David','+234 809 123 4567','Women of Impact','Active','May 14, 2024'],
 ['Daniel James','+234 810 987 6543','Ushers, Protocol','Active','May 14, 2024'],
 ['Grace Okafor','+234 811 223 3445',"Children's Ministry",'Inactive','May 12, 2024'],
 ['David Williams','+234 812 334 4556','Evangelism','Active','May 10, 2024'],
 ['Linda Emmanuel','+234 813 445 5667','Media Team','Active','May 9, 2024'],
]
const memberCentres=['The Goodland','Surulere Centre','Lekki Centre','Abuja Centre','Isolo Centre']
const memberRecords=members.map((member,index)=>({
 id:`member-${index+1}`,
 name:member[0], phone:member[1], groups:member[2], status:member[3], joined:member[4],
 email:`${member[0].toLowerCase().replaceAll(' ','_')}@example.com`,
 centre:memberCentres[index%memberCentres.length], membership:index===5?'Inactive':index<2?'New Member':'Active Member',
 lastActivity:index<2?'Today':index<5?'Yesterday':'May 10, 2024', events:index===0?12:index===1?8:index+2,
 push:index!==5, completion:index===5?64:index===1?91:100,
}))
const events=[
 ['Youth Conference 2026','Oct 24, 2026','Main Auditorium','432','Published','https://images.unsplash.com/photo-1511632765486-a01980e01a18?auto=format&fit=crop&w=600&q=80'],
 ['Leadership Seminar','Jan 9, 2027','Conference Room','128','Published','https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=600&q=80'],
 ['Women of Impact','Nov 7, 2026','Main Auditorium','95','Published','https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=600&q=80'],
 ["Men's Fellowship",'Dec 12, 2026','Fellowship Hall','64','Draft','https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=600&q=80'],
 ['Prayer Meeting','Every Wednesday from Oct 7, 2026','Online','—','Published','https://images.unsplash.com/photo-1507692049790-de58290a4334?auto=format&fit=crop&w=600&q=80'],
 ['Sunday Service','Every Sunday from Oct 4, 2026','Main Auditorium','—','Published','https://images.unsplash.com/photo-1519491050282-cf00c82424b4?auto=format&fit=crop&w=600&q=80'],
]
const messages=[
 ['Sunday Service Update',"Join us this Sunday for a powerful time in God's presence.",'Sent','May 16, 2024','All Members'],
 ['Youth Ministry Meeting','This is a reminder of our meeting this Sunday.','Sent','May 15, 2024','Youth Ministry'],
 ['Midweek Service Reminder',"Don't miss our midweek service tomorrow at 6PM.",'Scheduled','May 20, 2024','All Members'],
 ['Volunteers Needed','We need volunteers for the upcoming event.','Draft','—','Ushers, Protocol'],
 ['New Members Class','Join our new members class this Sunday.','Draft','—','New Members'],
]
const messageCategories=['General Announcement','Event','Registration','Reminder','Church Update','Important','New Member','System']
const messageDestinations=[['No destination',''],['Home','/home'],['Announcements','/announcements'],['Events','/events'],['Profile','/profile'],['My registrations','/my-registrations'],['Youth Conference 2026','/events/youth-conference-2024'],['Sunday Service announcement','/announcements/sunday-service-update'],['Paste external link','__external__']]
const eventOperations={
  logistics:{assemblyPoint:'The Goodland car park',assemblyTime:'7:00 AM',busSeats:120,buses:3,notes:'Registered attendees should assemble at the designated point before departure. Free buses will take attendees to the event location.'},
  registrations:{
   'Youth Conference 2026':[['John Doe','Member','Confirmed','Sep 1, 2026'],['Sarah Johnson','Member','Confirmed','Sep 1, 2026'],['David Williams','Guest','Waitlisted','Sep 2, 2026'],['Linda Emmanuel','Member','Checked in','Sep 2, 2026']],
   'Leadership Seminar':[['Michael Brown','Member','Confirmed','Sep 3, 2026'],['Esther David','Member','Confirmed','Sep 3, 2026']],
   'Women of Impact':[['Grace Okafor','Member','Confirmed','Sep 4, 2026'],['Linda Emmanuel','Member','Pending','Sep 4, 2026']],
  },
}

function Logo(){
 return <div className="brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
   <img src="https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png" alt="Global Impact Church" style={{ height: '36px', width: 'auto', objectFit: 'contain' }} />
   <span style={{ fontSize: '7px', letterSpacing: '1px', fontWeight: 700, color: '#f5c238' }}>GLOBAL IMPACT CHURCH</span>
 </div>
}
function Sidebar(){
 const loc=useLocation()
 const [open,setOpen]=useState({events:true,messages:true,settings:true})
 const active=(path)=>loc.pathname===path || (path!=='/'&&loc.pathname.startsWith(path))
 const item=(to,label,Icon,extra)=> <Link to={to} className={'nav-item '+(active(to)?'active':'')}><Icon size={17}/><span>{label}</span>{extra}</Link>
 return <aside className="sidebar">
   <Logo/>
   <div className="nav">
     {item('/dashboard','Dashboard',LayoutDashboard)}
     {item('/members','Members',Users)}
     {item('/ministry-applications','Ministry applications',ClipboardList)}
     <button className={'nav-item nav-button '+(active('/events')?'active':'')} onClick={()=>setOpen({...open,events:!open.events})}><CalendarDays size={17}/><span>Events</span><ChevronDown size={15} className={open.events?'':'rotated'}/></button>
     {open.events && <div className="subnav">{item('/events','All Events',CalendarDays)}{item('/events/registrations','Registrations',ClipboardList)}</div>}
     {item('/messages','Messages',MessageSquare)}
     {item('/settings','Settings',SettingsIcon)}
   </div>
   <div className="other-label">OTHER</div>
   <div className="nav">{item('/activity','Activity Log',Activity)}</div>
   <div className="admin-box"><div className="avatar">A</div><div><b>Admin</b><small>Super Admin</small></div><ChevronDown size={14}/></div>
 </aside>
}

function Shell({children}){
 const currentDate=new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date())
 return <div className="app-shell"><Sidebar/><div className="workspace"><header className="topbar"><div className="mobile-brand"><Menu size={20}/><Logo/></div><div className="top-spacer"/><div className="date-picker">{currentDate} <CalendarDays size={15}/></div></header>{children}</div></div>
}
function Page({title,subtitle,action,children}){
 return <main className="page"><div className="page-head"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</main>
}
function Card({children,className=''}){return <section className={'card '+className}>{children}</section>}
function Stat({label,value,change,icon:Icon,type='purple',to}){const content=<><div className={'stat-icon '+type}><Icon size={18}/></div><span>{label}</span><strong>{value}</strong><small className={change?.startsWith('↑')?'up':''}>{change}</small></>;return to?<Link className="stat card" to={to}>{content}</Link>:<Card className="stat">{content}</Card>}

function Dashboard(){
 const [quickOpen,setQuickOpen]=useState(false)
 const quickLinks=[['Add New Member','/members',UserPlus],['Create Event','/events',CalendarPlus],['Send Message','/messages',Send]]
 return <Page title="Dashboard" action={<button className="btn primary" onClick={()=>setQuickOpen(true)}><Plus size={15}/> Quick Action</button>}>
  <div className="stats"><Stat label="Total Members" value="2,458" change="↑ 12% vs last week" icon={Users}/><Stat label="New Members" value="128" change="↑ 18% vs last month" icon={UserPlus} type="green"/><Stat label="Events This Month" value="15" change="↑ 5 upcoming" icon={CalendarDays} type="orange"/><Stat label="Event Registrations" value="385" change="↑ 18% vs last week" icon={ClipboardList} type="blue"/></div>
  <div className="grid-2"><Card><div className="card-head"><b>Platform Onboarding Growth Rate</b><select><option>This Week</option><option>This Month</option></select></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={onboardingGrowthData}><CartesianGrid stroke="#eee" vertical={false}/><XAxis dataKey="d" fontSize={10}/><YAxis fontSize={10}/><Tooltip/><Line type="monotone" dataKey="v" name="Onboarding growth" stroke={purple} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></Card><Card><div className="card-head"><b>Recent Messages</b><Link to="/messages">View all</Link></div>{messages.slice(0,4).map((m,i)=><div className="mini-row icon-row" key={i}><div className="small-icon"><Send size={14}/></div><div><b>{m[0]}</b><small>{m[4]}</small></div><time>{m[3]}</time></div>)}</Card></div>
  {quickOpen&&<div className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-action-title" onMouseDown={(event)=>{if(event.target===event.currentTarget)setQuickOpen(false)}}><div className="quick-modal-card"><div className="quick-modal-head"><div><b id="quick-action-title">Quick Links</b><small>Choose an action to continue</small></div><button className="icon-btn" aria-label="Close quick links" onClick={()=>setQuickOpen(false)}><X size={17}/></button></div>{quickLinks.map(([label,to,Icon])=><Link className="quick-modal-link" to={to} key={to} onClick={()=>setQuickOpen(false)}><span className="quick-modal-icon"><Icon size={16}/></span><span>{label}</span><ChevronRight size={15}/></Link>)}</div></div>}
 </Page>
}

function Toolbar({search='Search...', children}){return <div className="toolbar"><div className="search"><Search size={15}/><input placeholder={search}/></div>{children||<><button className="tool"><Filter size={14}/> Filter</button><button className="tool">All Status <ChevronDown size={13}/></button><button className="tool">All Ministries <ChevronDown size={13}/></button><button className="tool"><Download size={14}/> Export</button></>}</div>}

function Members(){
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('All Statuses')
 const [centre,setCentre]=useState('All Centres')
 const [group,setGroup]=useState('All Groups')
 const [selected,setSelected]=useState([])
 const filtered=memberRecords.filter((member)=>{
   const searchable=`${member.name} ${member.phone} ${member.email} ${member.groups} ${member.centre}`.toLowerCase()
   return searchable.includes(query.toLowerCase()) && (status==='All Statuses'||member.status===status) && (centre==='All Centres'||member.centre===centre) && (group==='All Groups'||member.groups.includes(group))
 })
 const toggleMember=(id)=>setSelected((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id])
 const toggleAll=()=>setSelected(selected.length===filtered.length?[]:filtered.map((member)=>member.id))
 const groups=[...new Set(memberRecords.flatMap((member)=>member.groups.split(', ')))]
 return <Page title="Members" subtitle="Find, understand, manage, and take action on GIC members" action={<button className="btn primary"><Plus size={15}/> Add Member</button>}>
   <div className="member-stats"><Stat label="Total Members" value="2,458" change="All member records" icon={Users}/><Stat label="Active Members" value="1,897" change="77% of members" icon={CheckCircle2} type="green"/><Stat label="New Members" value="128" change="This month" icon={UserPlus} type="orange"/><Stat label="Push Enabled" value="2,104" change="86% of members" icon={Bell} type="blue"/></div>
   <Card className="table-card"><div className="member-toolbar"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search name, phone, email, group or centre..."/></div><select value={status} onChange={(event)=>setStatus(event.target.value)}><option>All Statuses</option><option>Active</option><option>Inactive</option></select><select value={centre} onChange={(event)=>setCentre(event.target.value)}><option>All Centres</option>{memberCentres.map((item)=><option key={item}>{item}</option>)}</select><select value={group} onChange={(event)=>setGroup(event.target.value)}><option>All Groups</option>{groups.map((item)=><option key={item}>{item}</option>)}</select><button className="tool"><Download size={14}/> Export</button></div>{selected.length>0&&<div className="bulk-bar"><b>{selected.length} selected</b><button className="tool"><Send size={14}/> Send notification</button><button className="tool">Add to group</button><button className="tool">Change status</button></div>}<div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={filtered.length>0&&selected.length===filtered.length} onChange={toggleAll}/></th><th>Member</th><th>Contact</th><th>Centre</th><th>Groups / Ministries</th><th>Status</th><th>Last Activity</th><th>Push</th><th>Actions</th></tr></thead><tbody>{filtered.map((member)=><tr key={member.id}><td><input type="checkbox" checked={selected.includes(member.id)} onChange={()=>toggleMember(member.id)}/></td><td><Link className="member-cell" to={`/members/${member.id}`}><div className="avatar">{member.name.split(' ').map((part)=>part[0]).join('')}</div><b>{member.name}</b></Link></td><td><span>{member.phone}</span><small className="table-subtext">{member.email}</small></td><td>{member.centre}</td><td>{member.groups}</td><td><span className={'badge '+(member.status==='Active'?'success':'gray')}>{member.status}</span></td><td>{member.lastActivity}</td><td><span className={'push-dot '+(member.push?'enabled':'disabled')} title={member.push?'Push enabled':'Push disabled'} /></td><td><Link className="icon-btn" to={`/members/${member.id}`} aria-label={`View ${member.name}`}><Eye size={17}/></Link></td></tr>)}</tbody></table></div><div className="pagination"><span>{filtered.length?`Showing 1 to ${filtered.length} of 2,458 members`:'No members match these filters'}</span><div><button>‹</button><button className="current">1</button><button>2</button><button>3</button><button>…</button><button>307</button><button>›</button></div></div></Card>
 </Page>
}

function MemberDetails(){
 const {id}=useParams()
 const member=memberRecords.find((item)=>item.id===id)||memberRecords[0]
 return <Page title={member.name} subtitle={`${member.membership} · ${member.centre}`}><div className="detail-toolbar"><Link to="/members"><ArrowLeft size={16}/> Back to Members</Link><div><button className="btn secondary"><Edit3 size={14}/> Edit</button><button className="btn primary"><Send size={14}/> Send notification</button></div></div><div className="member-profile-grid"><Card className="member-profile-main"><div className="member-profile-header"><div className="avatar member-avatar">{member.name.split(' ').map((part)=>part[0]).join('')}</div><div><h2>{member.name}</h2><span className="badge success">{member.status} Member</span><p>Member since {member.joined}</p></div></div><div className="profile-section"><h3>Personal information</h3><div className="profile-fields"><div><small>Phone</small><b>{member.phone}</b></div><div><small>Email</small><b>{member.email}</b></div><div><small>Centre</small><b>{member.centre}</b></div><div><small>Profile completion</small><b>{member.completion}%</b></div></div></div><div className="profile-section"><h3>Groups / Ministries</h3><div className="tag-list">{member.groups.split(', ').map((groupName)=><span className="tag" key={groupName}>{groupName}</span>)}</div></div></Card><Card className="member-side-card"><h3>Push devices</h3><div className="device-item"><div className="small-icon"><Globe size={14}/></div><div><b>Chrome on Windows</b><small>Last active: {member.lastActivity}</small></div><span className={'push-dot '+(member.push?'enabled':'disabled')} /></div><h3>Notification preferences</h3><div className="preference-row"><span>Push notifications</span><b>{member.push?'Enabled':'Disabled'}</b></div><div className="preference-row"><span>Events and reminders</span><b>Enabled</b></div><div className="preference-row"><span>Church announcements</span><b>Enabled</b></div></Card></div><div className="member-profile-grid member-profile-lower"><Card><div className="card-head"><h3>Activity timeline</h3><a>View all</a></div><div className="timeline"><div><b>Today</b><span>Updated profile information</span></div><div><b>{member.lastActivity}</b><span>Registered for an upcoming event</span></div><div><b>{member.joined}</b><span>Created member account</span></div></div></Card><Card><div className="card-head"><h3>Registrations</h3><a>View all</a></div><div className="registration-item"><b>Youth Conference 2026</b><span>Oct 24, 2026 · Confirmed</span></div><div className="registration-item"><b>Leadership Seminar</b><span>Jan 9, 2027 · Registered</span></div></Card></div></Page>
}

function Events(){
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('All Statuses')
 const visibleEvents=events.filter((event)=>event[0].toLowerCase().includes(query.toLowerCase())&&(status==='All Statuses'||event[4]===status))
 return <Page title="Events" subtitle="Manage church events, registrations, forms, attendance, and reminders" action={<button className="btn primary"><Plus size={15}/> Create Event</button>}><Card className="table-card"><div className="event-filters"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search events..."/></div><select value={status} onChange={(event)=>setStatus(event.target.value)}><option>All Statuses</option><option>Published</option><option>Draft</option></select><button className="tool"><CalendarDays size={14}/> Calendar</button></div><div className="event-list">{visibleEvents.map((e,i)=><Link className="event-admin-row" to={i===0?'/events/youth-conference-2024':'#'} key={e[0]}><img src={e[5]}/><div className="event-info"><b>{e[0]}</b><small><CalendarDays size={12}/>{e[1]} <span>•</span> <MapPinIcon/>{e[2]}</small></div><div className="reg-count"><b>{e[3]}</b><small>Registrations</small></div><span className={'badge '+(e[4]==='Published'?'success':'draft')}>{e[4]}</span><MoreHorizontal size={17}/></Link>)}</div><div className="pagination"><span>Showing {visibleEvents.length} of 15 events</span><div><button>‹</button><button className="current">1</button><button>2</button><button>3</button><button>›</button></div></div></Card></Page>
}
function MapPinIcon(){return <span>⌖</span>}

function EventDetail(){
 const [tab,setTab]=useState('Overview')
 const tabs=['Overview','Registrations','Attendance','Reminders']
 return <Page title="Youth Conference 2026" subtitle="Manage this event"><div className="detail-toolbar"><Link to="/events"><ArrowLeft size={16}/> Back to Events</Link><div><button className="btn secondary"><Edit3 size={14}/> Edit Event</button><button className="btn primary"><Send size={14}/> Send Notification</button></div></div><Card><div className="event-detail-top"><img src={events[0][5]}/><div><span className="badge success">Published</span><h2>Youth Conference 2026</h2><p><CalendarDays size={14}/> Oct 24, 2026 • 10:00 AM</p><p>⌖ Main Auditorium</p><p>432 registrations · Capacity 800</p></div></div><div className="tabs big">{tabs.map((item)=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item}</button>)}</div>{tab==='Overview'&&<><div className="event-stats"><Stat label="Registrations" value="432" change="↑ 18% this week" icon={ClipboardList}/><Stat label="Checked In" value="287" change="66% attendance" icon={CheckCircle2} type="green"/><Stat label="Capacity" value="800" change="54% filled" icon={Users} type="orange"/></div><div className="event-logistics"><div><b>Free bus logistics</b><span>{eventOperations.logistics.notes}</span></div><div><small>Assembly point</small><b>{eventOperations.logistics.assemblyPoint}</b></div><div><small>Assembly time</small><b>{eventOperations.logistics.assemblyTime}</b></div><div><small>Transport capacity</small><b>{eventOperations.logistics.buses} buses · {eventOperations.logistics.busSeats} seats</b></div></div></>}{tab==='Registrations'&&<EventRegistrations embedded/>}{tab==='Attendance'&&<Attendance embedded/>}{tab==='Reminders'&&<Reminders embedded/>}</Card></Page>
}

function EventRegistrations({embedded=false}){
 const eventNames=Object.keys(eventOperations.registrations)
 const [selectedEvent,setSelectedEvent]=useState(embedded?'Youth Conference 2026':eventNames[0])
 const [query,setQuery]=useState('')
 const registrations=eventOperations.registrations[selectedEvent]||[]
 const visibleRegistrations=registrations.filter((registration)=>registration[0].toLowerCase().includes(query.toLowerCase()))
 return <Page title="Registrations" subtitle="Select an event to manage its attendees" action={<button className="btn primary"><Download size={14}/> Export</button>}><div className="registration-event-grid">{eventNames.map((eventName)=><button className={'registration-event-card '+(selectedEvent===eventName?'active':'')} key={eventName} onClick={()=>setSelectedEvent(eventName)}><span className="registration-event-icon"><CalendarDays size={15}/></span><span><b>{eventName}</b><small>{eventOperations.registrations[eventName].length} visible registrations</small></span><ChevronRight size={15}/></button>)}</div><Card className="table-card"><div className="selected-event-heading"><div><small>Selected event</small><h2>{selectedEvent}</h2></div><span className="badge success">Registration open</span></div><div className="event-stats compact"><Stat label="Registered" value={selectedEvent==='Youth Conference 2026'?'432':registrations.length} change="This event" icon={ClipboardList}/><Stat label="Attended" value={selectedEvent==='Youth Conference 2026'?'287':Math.max(0,registrations.length-1)} change="Checked in" icon={CheckCircle2} type="green"/><Stat label="Waitlisted" value={selectedEvent==='Youth Conference 2026'?'18':registrations.filter((registration)=>registration[2]==='Waitlisted').length} change="Needs review" icon={Clock3} type="orange"/></div><div className="member-toolbar"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={`Search ${selectedEvent} registrations...`}/></div><button className="tool"><Filter size={14}/> Filters</button></div><div className="table-wrap"><table><thead><tr><th><input type="checkbox"/></th><th>Name</th><th>Type</th><th>Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>{visibleRegistrations.map((registration)=><tr key={`${selectedEvent}-${registration[0]}`}><td><input type="checkbox"/></td><td><b>{registration[0]}</b></td><td>{registration[1]}</td><td><span className={'badge '+(registration[2]==='Confirmed'||registration[2]==='Checked in'?'success':registration[2]==='Waitlisted'?'blue':'gray')}>{registration[2]}</span></td><td>{registration[3]}</td><td><button className="icon-btn"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div></Card></Page>
}

function EventForms({embedded=false}){
 return <Page title="Forms" subtitle="Collect registration information without unnecessary fields" action={<button className="btn primary"><Plus size={15}/> Create Form</button>}><Card className="table-card"><div className="form-library-row"><div className="small-icon"><FileText size={15}/></div><div><b>Conference Registration Form</b><small>Used by Youth Conference 2026 · Active</small></div><span className="badge success">Active</span><ChevronRight size={15}/></div><div className="form-fields-preview"><b>Fields collected</b><span>Full name</span><span>Phone</span><span>Email</span><span>Centre</span><span>Transport required</span><span>Assembly point</span></div></Card></Page>
}

function Attendance({embedded=false}){return <Page title="Attendance" subtitle="Track check-in for registered attendees"><Card className="attendance-panel"><div className="event-stats compact"><Stat label="Attended" value="287" change="of 432 registered" icon={CheckCircle2} type="green"/><Stat label="Not Checked In" value="145" change="Awaiting arrival" icon={Clock3} type="orange"/></div><button className="btn primary"><CheckCircle2 size={14}/> Check in attendee</button><p className="muted">Search a registration to check in attendees. Check-in time is recorded automatically.</p></Card></Page>}
function Reminders({embedded=false}){return <Page title="Reminders" subtitle="Send push reminders to registered attendees" action={<button className="btn primary"><Plus size={15}/> Create Reminder</button>}><Card className="reminder-row"><div className="small-icon"><Bell size={15}/></div><div><b>Event starts tomorrow</b><small>Push · Registered attendees · Scheduled</small></div><span className="badge blue">Scheduled</span></Card></Page>}

function Messages({initialTab='All'}){
 const [tab,setTab]=useState(initialTab)
 const [query,setQuery]=useState('')
 const [category,setCategory]=useState('All Categories')
 const [messageRecords,setMessageRecords]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{
  fetchAdminApi('/api/admin/notifications')
  .then(({items=[]})=>setMessageRecords(items.map((item)=>[
   item.id,
    item.title,
    item.body,
    ['SENT','PARTIALLY_FAILED','FAILED'].includes(item.status)?'Sent':item.status==='SCHEDULED'?'Scheduled':item.status==='DRAFT'?'Draft':item.status,
    item.sentAt||item.scheduledAt||item.createdAt||'—',
    item.audience,
   ])))
   .catch((requestError)=>setError(requestError.message))
   .finally(()=>setLoading(false))
 },[])
 const tabStatuses={Scheduled:'Scheduled',Drafts:'Draft',Sent:'Sent'}
 const visible=messageRecords.filter((message)=>{const matchesTab=tab==='All'||message[3]===tabStatuses[tab];const matchesQuery=`${message[1]} ${message[2]} ${message[5]}`.toLowerCase().includes(query.toLowerCase());return matchesTab&&matchesQuery&&(category==='All Categories'||(message[1].toLowerCase().includes(category.toLowerCase().split(' ')[0])))} )
 return <Page title="Messages" subtitle="Create, schedule, target, and analyze push notifications" action={<Link className="btn primary" to="/messages/new"><Plus size={15}/> New Message</Link>}><Card className="table-card"><div className="tabs message-tabs">{['All','Scheduled','Drafts','Sent'].map((item)=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item==='All'?'All Messages':item}</button>)}</div><div className="message-toolbar"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search messages..."/></div><select value={category} onChange={(event)=>setCategory(event.target.value)}><option>All Categories</option>{messageCategories.map((item)=><option key={item}>{item}</option>)}</select><button className="tool"><Filter size={14}/> Filters</button></div>{loading&&<div className="empty-message">Loading messages...</div>}{error&&<div className="empty-message">Messages are unavailable right now.</div>} {!loading&&!error&&<div className="message-list">{visible.map((m,i)=><Link className="message-row" to={`/messages/${m[0]}`} key={`${m[0]}-${i}`}><div className={'message-icon '+(m[3]==='Sent'?'sent':'')}>{m[3]==='Sent'?<Send size={16}/>:m[3]==='Scheduled'?<CalendarDays size={16}/>:<FileText size={16}/>}</div><div className="message-main"><b>{m[1]}</b><small>{m[2]}</small></div><span className={'badge '+(m[3]==='Sent'?'success':m[3]==='Scheduled'?'blue':'gray')}>{m[3]}</span><time>{m[4]}</time><small>To: {m[5]}</small><MoreHorizontal size={17}/></Link>)}</div>}{!loading&&!error&&!visible.length&&<div className="empty-message">No messages match these filters.</div>}</Card></Page>
}

function NewMessage(){
 const navigate=useNavigate()
 const [title,setTitle]=useState('')
 const [body,setBody]=useState('')
 const [audience,setAudience]=useState('Everyone')
 const [category,setCategory]=useState('General Announcement')
 const [destination,setDestination]=useState('')
 const [destinationType,setDestinationType]=useState('internal')
 const [externalDestination,setExternalDestination]=useState('')
 const [delivery,setDelivery]=useState('now')
 const [scheduledAt,setScheduledAt]=useState(()=>new Date(Date.now()+60*60*1000).toISOString().slice(0,16))
 const [sent,setSent]=useState(false)
 const [memberSearch,setMemberSearch]=useState('')
 const [segment,setSegment]=useState('Active members')
 const [eventName,setEventName]=useState('Youth Conference 2026')
 const [registrationStatus,setRegistrationStatus]=useState('All registrants')
 const [status,setStatus]=useState('Active')
 const [group,setGroup]=useState('All groups / ministries')
 const [centre,setCentre]=useState('All centres')
 const [push,setPush]=useState('Push-enabled members')
 useEffect(()=>{
  if(delivery!=='schedule') return
  const dateInput=document.querySelector('input[type="date"]')
  const timeInput=document.querySelector('input[type="time"]')
  if(!dateInput||!timeInput) return
  dateInput.value=scheduledAt.slice(0,10)
  timeInput.value=scheduledAt.slice(11,16)
  const update=()=>setScheduledAt(`${dateInput.value}T${timeInput.value}`)
  dateInput.addEventListener('change',update); timeInput.addEventListener('change',update)
  return ()=>{dateInput.removeEventListener('change',update);timeInput.removeEventListener('change',update)}
 },[delivery,scheduledAt])
 const destinationOption=messageDestinations.find((item)=>item[1]===destination)
 const destinationPreview=destinationType==='external'?externalDestination||'No external URL':destinationOption?.[1]||'No in-app destination'
 useEffect(()=>{if(destination==='__external__'){const pasted=window.prompt('Paste the external destination URL');if(pasted){setDestinationType('external');setExternalDestination(pasted)}else setDestination('')}},[destination])
 const save=async(result)=>{
  if(!title.trim()||!body.trim()){setSent('Title and message are required');return}
  try{
   const type=category==='Event'?'EVENT_PUBLISHED':category==='Reminder'?'EVENT_REMINDER':category==='Registration'?'REGISTRATION_CONFIRMATION':category==='Church Update'?'GENERAL_ANNOUNCEMENT':'GENERAL_ANNOUNCEMENT'
   const targetAudience=audience==='Everyone'?'everyone':audience==='Event registrants'?'event_registrants':audience==='Selected members'?'members':'members'
  const destinationUrl=destinationType==='external'?externalDestination.trim():destination
  if(destinationUrl&&destinationType==='external'&&!/^https?:\/\//i.test(destinationUrl)){setSent('External links must start with http:// or https://');return}
  const created=await fetchAdminApi('/api/admin/notifications',{method:'POST',body:JSON.stringify({title:title.trim(),body:body.trim(),type,audience:targetAudience,destinationUrl:destinationUrl||undefined,scheduledAt:result==='Scheduled'&&scheduledAt?new Date(scheduledAt).toISOString():undefined})})
   if(result==='Sent') await fetchAdminApi(`/api/admin/notifications/${created.id}/send`,{method:'POST'})
   setSent(result==='Sent'? 'Sent' : result==='Scheduled' ? 'Scheduled' : 'Draft')
   if(result==='Sent'||result==='Scheduled') setTimeout(()=>navigate('/messages'),250)
  }catch(error){setSent(error.message||'Unable to save message')}
 }
 const audienceSummary=audience==='Everyone'?'All eligible members with push enabled':audience==='Selected members'?'Members selected by name, phone, or email':audience==='Segment'?segment:audience==='Event registrants'?`${eventName} · ${registrationStatus}`:`${status} · ${group} · ${centre} · ${push}`
 return <Page title="New Message" subtitle="Compose a push notification for GIC members"><div className="composer-layout"><Card className="composer-card"><div className="card-head"><div><b>Message details</b><small>All messages are delivered through GIC push notifications.</small></div></div><label className="form-field">Title<input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Sunday Service Reminder"/></label><label className="form-field">Message<textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Write your notification message..." rows="5"/></label><div className="composer-grid"><label className="form-field">Category<select value={category} onChange={(event)=>setCategory(event.target.value)}>{messageCategories.map((item)=><option key={item}>{item}</option>)}</select></label><label className="form-field">Destination page<select value={destination} onChange={(event)=>setDestination(event.target.value)}><option value="">No destination</option>{messageDestinations.filter((item)=>item[1]).map(([label,path])=><option value={path} key={path}>{label} ({path})</option>)}</select></label></div><div className="destination-preview">Exact destination: <b>{destinationOption?.[1]||'No in-app destination'}</b></div><div className="composer-section"><b>Audience</b><div className="audience-options">{['Everyone','Selected members','Segment','Event registrants','Custom audience'].map((item)=><label key={item}><input type="radio" name="audience" checked={audience===item} onChange={()=>setAudience(item)}/>{item}</label>)}</div>{audience==='Selected members'&&<div className="audience-builder audience-specific"><label className="form-field">Find members<input value={memberSearch} onChange={(event)=>setMemberSearch(event.target.value)} placeholder="Search by name, phone, or email..."/></label><div className="selected-member-list"><label><input type="checkbox"/> John Doe <small>Active · The Goodland</small></label><label><input type="checkbox"/> Sarah Johnson <small>Active · Surulere Centre</small></label><label><input type="checkbox"/> Michael Brown <small>Active · Lekki Centre</small></label></div></div>}{audience==='Segment'&&<div className="audience-builder audience-specific"><label className="form-field">Saved segment<select value={segment} onChange={(event)=>setSegment(event.target.value)}><option>Active members</option><option>New Members</option><option>Members with incomplete profiles</option><option>Members who have not attended recently</option><option>Push-enabled members</option></select></label><p className="audience-help">Segments are reusable member groups managed from Members.</p></div>}{audience==='Event registrants'&&<div className="audience-builder audience-specific"><label className="form-field">Event<select value={eventName} onChange={(event)=>setEventName(event.target.value)}><option>Youth Conference 2026</option><option>Leadership Seminar</option><option>Women of Impact</option></select></label><label className="form-field">Registration status<select value={registrationStatus} onChange={(event)=>setRegistrationStatus(event.target.value)}><option>All registrants</option><option>Confirmed</option><option>Waitlisted</option><option>Checked in</option><option>Registered but not attended</option></select></label><p className="audience-help">Only members registered for the selected event will receive this message.</p></div>}{audience==='Custom audience'&&<div className="audience-builder"><div className="composer-grid"><label className="form-field">Member status<select value={status} onChange={(event)=>setStatus(event.target.value)}><option>Active</option><option>Inactive</option><option>Pending</option><option>New Member</option><option>Visitor</option></select></label><label className="form-field">Groups / Ministries<select value={group} onChange={(event)=>setGroup(event.target.value)}><option>All groups / ministries</option><option>Youth</option><option>Media</option><option>Choir</option><option>Men's Fellowship</option><option>Children's Ministry</option><option>Ushering</option></select></label><label className="form-field">Centre<select value={centre} onChange={(event)=>setCentre(event.target.value)}><option>All centres</option><option>The Goodland</option><option>Surulere Centre</option><option>Lekki Centre</option><option>Abuja Centre</option><option>Isolo Centre</option></select></label><label className="form-field">Push availability<select value={push} onChange={(event)=>setPush(event.target.value)}><option>Push-enabled members</option><option>Any push status</option><option>Push disabled</option></select></label></div></div>}<div className="audience-summary"><b>Audience: {audience}</b><span>{audienceSummary}</span><small>Estimated audience updates from the selected criteria before sending.</small></div></div><div className="composer-section"><b>Delivery</b><div className="delivery-options"><label><input type="radio" name="delivery" checked={delivery==='now'} onChange={()=>setDelivery('now')}/> Send now</label><label><input type="radio" name="delivery" checked={delivery==='schedule'} onChange={()=>setDelivery('schedule')}/> Schedule</label></div>{delivery==='schedule'&&<div className="composer-grid"><label className="form-field">Date<input type="date" defaultValue="2026-09-06"/></label><label className="form-field">Time<input type="time" defaultValue="07:00"/></label></div>}</div><div className="composer-actions"><Link className="btn secondary" to="/messages">Cancel</Link><button className="btn secondary" onClick={()=>save('Draft')}>Save Draft</button>{delivery==='schedule'?<button className="btn primary" onClick={()=>save('Scheduled')}>Schedule</button>:<button className="btn primary" onClick={()=>save('Sent')} disabled={!title||!body}>Send</button>}</div>{sent&&<p className="saved"><CheckCircle2 size={14}/> Message {sent.toLowerCase()}.</p>}</Card><Card className="phone-preview"><b>Preview as member</b><div className="phone-frame"><small>GLOBAL IMPACT CHURCH</small><strong>{title||'Your notification title'}</strong><p>{body||'Your notification message will appear here.'}</p><span>{destinationOption?.[1]||'now'}</span></div></Card></div></Page>
}

function NewMessageLegacy(){
 const navigate=useNavigate()
 const [title,setTitle]=useState('')
 const [body,setBody]=useState('')
 const [audience,setAudience]=useState('Everyone')
 const [memberStatus,setMemberStatus]=useState('All statuses')
 const [memberGroup,setMemberGroup]=useState('All groups / ministries')
 const [memberCentre,setMemberCentre]=useState('All centres')
 const [eventRegistration,setEventRegistration]=useState('Any registration')
 const [pushAvailability,setPushAvailability]=useState('Push-enabled members')
 const [profileCompletion,setProfileCompletion]=useState('Any profile completion')
 const [engagement,setEngagement]=useState('Any recent activity')
 const [category,setCategory]=useState('General Announcement')
 const [destination,setDestination]=useState('No destination')
 const [delivery,setDelivery]=useState('now')
 const [saved,setSaved]=useState(false)
 const finish=(message)=>{setSaved(message);if(message==='Sent')setTimeout(()=>navigate('/messages/1'),250)}
 const destinationOption=messageDestinations.find((item)=>item[1]===destination)
 return <Page title="New Message" subtitle="Compose a push notification for GIC members"><div className="composer-layout"><Card className="composer-card"><div className="card-head"><div><b>Message details</b><small>All messages are delivered through GIC push notifications.</small></div></div><label className="form-field">Title<input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder="Sunday Service Reminder"/></label><label className="form-field">Message<textarea value={body} onChange={(event)=>setBody(event.target.value)} placeholder="Write your notification message..." rows="5"/></label><div className="composer-grid"><label className="form-field">Category<select value={category} onChange={(event)=>setCategory(event.target.value)}>{messageCategories.map((item)=><option key={item}>{item}</option>)}</select></label><label className="form-field">Destination page<select value={destination} onChange={(event)=>setDestination(event.target.value)}>{messageDestinations.map(([label,path])=><option value={path} key={path||label}>{label}{path?` (${path})`:''}</option>)}</select></label></div><div className="destination-preview">Exact destination: <b>{destinationOption?.[1]||'No in-app destination'}</b></div><div className="composer-section"><b>Audience</b><div className="audience-options">{['Everyone','Selected members','Segment','Event registrants','Custom audience'].map((item)=><label key={item}><input type="radio" name="audience" checked={audience===item} onChange={()=>setAudience(item)}/>{item}</label>)}</div>{audience!=='Everyone'&&<div className="audience-builder"><div className="composer-grid"><label className="form-field">Member status<select value={memberStatus} onChange={(event)=>setMemberStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Inactive</option><option>Pending</option><option>New Member</option><option>Visitor</option></select></label><label className="form-field">Groups / Ministries<select value={memberGroup} onChange={(event)=>setMemberGroup(event.target.value)}><option>All groups / ministries</option><option>Youth</option><option>Media</option><option>Choir</option><option>Men's Fellowship</option><option>Children's Ministry</option><option>Ushering</option></select></label><label className="form-field">Centre<select value={memberCentre} onChange={(event)=>setMemberCentre(event.target.value)}><option>All centres</option><option>The Goodland</option><option>Surulere Centre</option><option>Lekki Centre</option><option>Abuja Centre</option><option>Isolo Centre</option></select></label><label className="form-field">Push availability<select value={pushAvailability} onChange={(event)=>setPushAvailability(event.target.value)}><option>Push-enabled members</option><option>Any push status</option><option>Push disabled</option></select></label><label className="form-field">Profile completion<select value={profileCompletion} onChange={(event)=>setProfileCompletion(event.target.value)}><option>Any profile completion</option><option>Complete profiles</option><option>Below 70% complete</option></select></label><label className="form-field">Recent engagement<select value={engagement} onChange={(event)=>setEngagement(event.target.value)}><option>Any recent activity</option><option>Active in last 7 days</option><option>Inactive for 30+ days</option><option>Never attended</option></select></label></div><label className="form-field">Event registration<select value={eventRegistration} onChange={(event)=>setEventRegistration(event.target.value)}><option>Any registration</option><option>Youth Conference 2026 · Confirmed</option><option>Youth Conference 2026 · Attended</option><option>Youth Conference 2026 · Registered, not attended</option><option>Leadership Seminar · Confirmed</option><option>No event registration</option></select></label></div>}<div className="audience-summary"><b>Audience: {audience}</b><span>{memberStatus} · {memberGroup} · {memberCentre} · {eventRegistration} · {pushAvailability}</span><small>{profileCompletion} · {engagement} · Estimated: 4,821 members · 4,763 with active push devices · 58 unavailable</small></div></div><div className="composer-section"><b>Delivery</b><div className="delivery-options"><label><input type="radio" name="delivery" checked={delivery==='now'} onChange={()=>setDelivery('now')}/> Send now</label><label><input type="radio" name="delivery" checked={delivery==='schedule'} onChange={()=>setDelivery('schedule')}/> Schedule</label></div>{delivery==='schedule'&&<div className="composer-grid"><label className="form-field">Date<input type="date" defaultValue="2026-09-06"/></label><label className="form-field">Time<input type="time" defaultValue="07:00"/></label></div>}</div><div className="composer-actions"><Link className="btn secondary" to="/messages">Cancel</Link><button className="btn secondary" onClick={()=>finish('Draft')}>Save Draft</button>{delivery==='schedule'?<button className="btn primary" onClick={()=>finish('Scheduled')}>Schedule</button>:<button className="btn primary" onClick={()=>finish('Sent')} disabled={!title||!body}>Send</button>}</div>{saved&&<p className="saved"><CheckCircle2 size={14}/> Message {saved.toLowerCase()}.</p>}</Card><Card className="phone-preview"><b>Preview as member</b><div className="phone-frame"><small>GLOBAL IMPACT CHURCH</small><strong>{title||'Your notification title'}</strong><p>{body||'Your notification message will appear here.'}</p><span>{destinationOption?.[1]||'now'}</span></div></Card></div></Page>
}

function MessageDetail(){
 const {id}=useParams()
 const [message,setMessage]=useState(null)
 const [error,setError]=useState('')
 useEffect(()=>{fetchAdminApi(`/api/admin/notifications/${id}`).then(({notification})=>setMessage(notification)).catch((requestError)=>setError(requestError.message))},[id])
 if(error)return <Page title="Message details"><Card className="empty-message">{error}</Card></Page>
 if(!message)return <Page title="Message details"><Card className="empty-message">Loading message details...</Card></Page>
 const statusLabel=message.status==='SENT'?'Sent':message.status==='SCHEDULED'?'Scheduled':message.status==='DRAFT'?'Draft':message.status
 return <Page title={message.title} subtitle="Live notification details"><div className="detail-toolbar"><Link to="/messages"><ArrowLeft size={16}/> Back to Messages</Link><div><Link className="btn secondary" to="/messages/new"><Edit3 size={14}/> New Message</Link></div></div><div className="message-detail-grid"><Card><div className="message-status"><span className={'badge '+(statusLabel==='Sent'?'success':'blue')}>{statusLabel}</span><span>{message.sentAt||message.scheduledAt||message.createdAt||'—'}</span></div><h2>{message.title}</h2><p>{message.body}</p><div className="audience"><Users size={15}/> Audience <b>{message.audience}</b></div><div className="detail-content"><h3>Content</h3><div><small>Destination</small><b>{message.destinationUrl||'No destination'}</b></div><div><small>Created by</small><b>{message.createdBy}</b></div></div></Card><div className="message-metrics"><Stat label="Recipients" value={message.recipientCount||'0'} change="Resolved recipients" icon={Users}/><Stat label="Sent" value={message.sentCount||'0'} change="Accepted by FCM" icon={CheckCircle2} type="green"/><Stat label="Failed" value={message.failedCount||'0'} change="Delivery failures" icon={X} type="orange"/></div></div></Page>
}

function Settings(){
 const [section,setSection]=useState('General')
 const [saved,setSaved]=useState(false)
 const sections=[['General',SettingsIcon],['Church Information',Globe],['Branding',Edit3],['Permissions',Shield],['Security',Lock],['Integrations',Database],['Danger Zone',Trash2]]
 const saveChanges=()=>setSaved(true)
 return <Page title="Settings" subtitle="Control how the GIC platform behaves"><div className="settings-layout"><Card className="settings-nav">{sections.map(([label,Icon])=><button className={section===label?'active':''} key={label} onClick={()=>{setSection(label);setSaved(false)}}><Icon size={16}/>{label}</button>)}</Card><Card className="settings-form"><div className="card-head"><div><b>{section}</b><small>Operational controls for the GIC platform</small></div></div>{section==='Church Information'&&<div className="form-grid"><label>Church name<input defaultValue="GLOBAL IMPACT CHURCH"/></label><label>Short name<input defaultValue="GIC"/></label><label>Website<input defaultValue="https://globalimpactng.org"/></label><label>Phone<input defaultValue="+234 801 234 5678"/></label><label>Address<input defaultValue="Lagos, Nigeria"/></label><label>Timezone<select defaultValue="Africa/Lagos"><option>Africa/Lagos</option></select></label><label>Default language<select defaultValue="English"><option>English</option></select></label></div>}{section==='General'&&<div className="settings-choice-list"><div><b>Platform preferences</b><small>Default date, time, and member-management behavior.</small></div><div><span>Default date format</span><select defaultValue="September 5, 2026"><option>September 5, 2026</option></select></div><div><span>Default member centre terminology</span><b>Centre</b></div><div><span>Groups and ministries</span><b>Use one combined member field</b></div></div>}{section==='Branding'&&<div className="form-grid"><label>Application name<input defaultValue="GLOBAL IMPACT CHURCH"/></label><label>Short name<input defaultValue="GIC"/></label><label>Theme color<input type="color" defaultValue="#4b20b5"/></label><label>Background color<input type="color" defaultValue="#f6f7fb"/></label><div className="branding-preview"><Logo/><b>GLOBAL IMPACT CHURCH</b><span>Add to Home Screen</span></div></div>}{section==='Users & Roles'&&<div className="admin-users"><div className="admin-user-row"><div className="avatar">A</div><div><b>Admin</b><small>Super Admin · Active</small></div><span>Active now</span><button className="icon-btn"><MoreHorizontal size={17}/></button></div><div className="admin-user-row"><div className="avatar">C</div><div><b>Communications Manager</b><small>Messages · Active</small></div><span>2 hours ago</span><button className="icon-btn"><MoreHorizontal size={17}/></button></div><button className="btn primary"><Plus size={14}/> Invite administrator</button></div>}{section==='Permissions'&&<div className="permission-table"><div className="permission-row permission-head"><b>Area</b><b>View</b><b>Create</b><b>Edit</b><b>Delete</b></div>{['Members','Events','Registrations','Forms','Attendance','Messages','Settings','Activity Logs'].map((area)=><div className="permission-row" key={area}><span>{area}</span><input type="checkbox" defaultChecked/><input type="checkbox" defaultChecked={area!=='Activity Logs'}/><input type="checkbox" defaultChecked={['Members','Events','Messages'].includes(area)}/><input type="checkbox" defaultChecked={['Events','Forms'].includes(area)}/></div>)}</div>}{section==='Push Notifications'&&<div className="settings-choice-list"><div><b>Push notification defaults</b><small>GIC uses push notifications only. No email, SMS, WhatsApp, or Firebase Auth controls are configured here.</small></div>{['Push notifications','Allow administrators to send notifications','Allow event reminders','Allow registration confirmations','Allow event updates','Allow system notifications'].map((label)=><label className="toggle-row" key={label}><span>{label}</span><input type="checkbox" defaultChecked/></label>)}</div>}{section==='Security'&&<div className="settings-choice-list"><div><b>Authentication</b><small>Device authentication and admin session controls.</small></div><div><span>Authentication status</span><b>Active</b></div><div><span>Session duration</span><b>30 days</b></div><div><span>Failed login protection</span><b>Enabled</b></div><button className="btn secondary">Revoke other admin sessions</button></div>}{section==='Integrations'&&<div className="integration-list"><div><div className="small-icon"><Send size={15}/></div><div><b>Firebase Cloud Messaging</b><small>Connected · Push delivery only</small></div><span className="badge success">Connected</span></div><div><div className="small-icon"><Database size={15}/></div><div><b>PostgreSQL</b><small>Connected · Primary application database</small></div><span className="badge success">Connected</span></div></div>}{section==='Danger Zone'&&<div className="danger-zone"><h3>Danger Zone</h3><p>Destructive platform actions require confirmation and appropriate permissions.</p><button className="btn danger">Reset selected settings</button><button className="btn danger">Deactivate platform</button></div>}<div className="save-row">{saved&&<span className="saved"><CheckCircle2 size={14}/> Changes saved and logged</span>}<button className="btn primary" onClick={saveChanges}><Save size={14}/> Save Changes</button></div></Card></div></Page>
}

function SettingsLegacy(){
 const [saved,setSaved]=useState(false)
 return <Page title="Settings" subtitle="Manage system settings and preferences"><div className="settings-layout"><Card className="settings-nav">{[['General',SettingsIcon],['Church Information',Globe],['Users & Roles',Users],['Notifications',Bell],['Security',Lock],['Integrations',Database],['Backup',Database]].map(([x,I],i)=><button className={i===0?'active':''} key={x}><I size={16}/>{x}</button>)}</Card><Card className="settings-form"><div className="card-head"><div><b>General Settings</b><small>Manage your church's general information</small></div></div><div className="form-grid"><label>Church Name<input defaultValue="Global Impact Church"/></label><label>Church Email<input defaultValue="info@globalimpactng.org"/></label><label>Church Phone<input defaultValue="+234 801 234 5678"/></label><label>Timezone<select defaultValue="(GMT+01:00) West Africa Time"><option>(GMT+01:00) West Africa Time</option></select></label><label>Date Format<select defaultValue="May 18, 2024"><option>May 18, 2024</option></select></label><label>Time Format<select defaultValue="12 Hour (AM/PM)"><option>12 Hour (AM/PM)</option></select></label><label>Language<select defaultValue="English"><option>English</option></select></label></div><div className="save-row">{saved&&<span className="saved"><CheckCircle2 size={14}/> Changes saved</span>}<button className="btn primary" onClick={()=>setSaved(true)}><Save size={14}/> Save Changes</button></div></Card></div></Page>
}

function ActivityLog(){
 const [query,setQuery]=useState('')
 const [action,setAction]=useState('All activity')
 const [selected,setSelected]=useState(null)
 const entries=[
  {actor:'John Doe',action:'Changed member status',target:'Jane Smith',time:'Today · 10:42 AM',category:'Members',status:'Successful',detail:'Membership status changed from Pending to Active.'},
  {actor:'Jane Doe',action:'Created event',target:'Sunday Service',time:'Today · 09:21 AM',category:'Events',status:'Successful',detail:'Created and saved a new published event.'},
  {actor:'John Doe',action:'Sent notification',target:'2,481 members',time:'Yesterday · 06:31 PM',category:'Messages',status:'Successful',detail:'Push notification accepted for delivery.'},
  {actor:'System',action:'Scheduled event reminder',target:'Youth Conference 2026',time:'Yesterday · 05:10 PM',category:'Messages',status:'Successful',detail:'Reminder scheduled for registered attendees.'},
  {actor:'Sarah Doe',action:'Changed admin role',target:'Michael Doe',time:'Sep 3, 2026 · 02:15 PM',category:'Settings',status:'Successful',detail:'Role changed from Viewer to Event Manager.'},
  {actor:'Admin',action:'Failed login attempt',target:'Admin dashboard',time:'Sep 3, 2026 · 08:03 AM',category:'Security',status:'Failed',detail:'Authentication failed for the submitted credentials.'},
 ]
 const visible=entries.filter((entry)=>(action==='All activity'||entry.category===action)&&`${entry.actor} ${entry.action} ${entry.target}`.toLowerCase().includes(query.toLowerCase()))
 return <Page title="Activity Log" subtitle="Track who did what, when, and where."><Card className="activity-summary"><Stat label="Total events" value="1,284" change="All recorded activity" icon={Activity}/><Stat label="Today" value="42" change="Meaningful changes" icon={Clock3} type="green"/><Stat label="Security events" value="8" change="Authentication and access" icon={Shield} type="orange"/><Stat label="Failed actions" value="3" change="Needs review" icon={X} type="blue"/></Card><Card className="table-card"><div className="activity-toolbar"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search activity, actor, or target..."/></div><select value={action} onChange={(event)=>setAction(event.target.value)}><option>All activity</option><option>Members</option><option>Events</option><option>Messages</option><option>Settings</option><option>Security</option></select><button className="tool"><Download size={14}/> Export</button></div><div className="activity-list">{visible.map((entry,index)=><button className="activity-row" key={`${entry.actor}-${index}`} onClick={()=>setSelected(entry)}><div className={'activity-type '+(entry.status==='Failed'?'failed':'')}><Activity size={14}/></div><div className="activity-main"><b>{entry.actor} {entry.action.toLowerCase()}</b><small>{entry.target}</small></div><span className="badge gray">{entry.category}</span><time>{entry.time}</time><span className={'badge '+(entry.status==='Successful'?'success':'gray')}>{entry.status}</span><ChevronRight size={15}/></button>)}</div>{!visible.length&&<div className="empty-message">No activity matches these filters.</div>}</Card>{selected&&<div className="activity-drawer-backdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelected(null)}}><aside className="activity-drawer"><div className="drawer-head"><div><b>Activity Details</b><small>{selected.category.toUpperCase()}</small></div><button className="icon-btn" onClick={()=>setSelected(null)}><X size={17}/></button></div><div className="drawer-section"><small>Actor</small><b>{selected.actor}</b><span>Administrator</span></div><div className="drawer-section"><small>Target</small><b>{selected.target}</b><span>{selected.category}</span></div><div className="drawer-section"><small>Action</small><b>{selected.action}</b><p>{selected.detail}</p></div><div className="drawer-section"><small>Time</small><b>{selected.time}</b><span>Africa/Lagos · Admin dashboard</span></div><div className="drawer-section"><small>Activity ID</small><code>act_01JICM{selected.actor.length}{selected.target.length}</code></div></aside></div>}
 </Page>
}

function Placeholder({title}){return <Page title={title}><Card className="empty"><Activity size={30}/><h2>{title}</h2><p>This static screen is included as a navigation placeholder and is ready for backend integration.</p></Card></Page>}

function LiveActivityLog(){
 const [items,setItems]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{fetchAdminApi('/api/admin/activity').then(({items:records=[]})=>setItems(records)).catch((requestError)=>setError(requestError.message)).finally(()=>setLoading(false))},[])
 return <Page title="Activity Log" subtitle="Recorded administrator and member actions"><Card className="table-card">{loading&&<div className="empty-message">Loading activity...</div>}{error&&<div className="empty-message">Activity log is unavailable right now.</div>}{!loading&&!error&&!items.length&&<div className="empty-message">No activity has been recorded yet.</div>}{!loading&&!error&&items.length>0&&<div className="activity-list">{items.map((item)=><div className="activity-row" key={item.id}><div className="activity-type"><Activity size={14}/></div><div className="activity-main"><b>{item.actorName||item.actorId} {item.action.toLowerCase()}</b><small>{item.target}</small></div><span className="badge gray">Recorded</span><time>{item.createdAt?new Date(item.createdAt).toLocaleString():'—'}</time></div>)}</div>}</Card></Page>
}

function EventsUnavailable(){
 const [createOpen,setCreateOpen]=useState(false)
 const [title,setTitle]=useState('')
 const [description,setDescription]=useState('')
 const [startsAt,setStartsAt]=useState('')
 const [endsAt,setEndsAt]=useState('')
 const [location,setLocation]=useState('')
 const [isPaid,setIsPaid]=useState(false)
 const [price,setPrice]=useState('')
 const [imageUrl,setImageUrl]=useState('')
 const [notifyOnPublish,setNotifyOnPublish]=useState(true)
 const [status,setStatus]=useState('DRAFT')
 const [saving,setSaving]=useState(false)
 const [notice,setNotice]=useState('')
 const createEvent=async(event)=>{event.preventDefault();setSaving(true);setNotice('');if(endsAt&&new Date(endsAt)<=new Date(startsAt)){setNotice('End time must be after start time.');setSaving(false);return}try{await fetchAdminApi('/api/admin/events',{method:'POST',body:JSON.stringify({title,description,startsAt:new Date(startsAt).toISOString(),endsAt:endsAt?new Date(endsAt).toISOString():undefined,location,isPaid,price:isPaid?Number(price):undefined,imageUrl,notifyOnPublish,status})});setNotice('Event created successfully.');setCreateOpen(false);setTitle('');setDescription('');setStartsAt('');setEndsAt('');setLocation('');setPrice('');setImageUrl('')}catch(error){setNotice(error.message||'Event could not be created.')}finally{setSaving(false)}}
 return <Page title="Events" subtitle="Manage events from the GIC platform" action={<button className="btn primary" onClick={()=>setCreateOpen(true)}><Plus size={15}/> Create Event</button>}>
   {notice&&<Card className="empty-message">{notice}</Card>}<Card className="empty"><CalendarDays size={30}/><h2>No live event data</h2><p>Create the first event to add it to the platform.</p></Card>
   {createOpen&&<div className="quick-modal" role="dialog" aria-modal="true"><form className="quick-modal-card" onSubmit={createEvent}><div className="quick-modal-head"><div><b>Create Event</b><small>Add a real event to the GIC platform.</small></div><button type="button" className="icon-btn" onClick={()=>setCreateOpen(false)}><X size={17}/></button></div><label className="form-field">Title<input value={title} onChange={(event)=>setTitle(event.target.value)} required /></label><label className="form-field">Description<textarea value={description} onChange={(event)=>setDescription(event.target.value)} rows="3" /></label><label className="form-field">Event image<input type="file" accept="image/*" onChange={(event)=>{const file=event.target.files?.[0];if(file){const reader=new FileReader();reader.onload=()=>setImageUrl(String(reader.result));reader.readAsDataURL(file)}}}/></label><label className="form-field">Start date and time<input type="datetime-local" value={startsAt} onChange={(event)=>setStartsAt(event.target.value)} required /></label><label className="form-field">End date and time<input type="datetime-local" value={endsAt} onChange={(event)=>setEndsAt(event.target.value)} /></label><label className="form-field">Location<select value={location} onChange={(event)=>setLocation(event.target.value)}><option value="">Choose a location</option><option>Main Auditorium</option><option>Conference Room</option><option>Fellowship Hall</option><option>Online</option><option value="__custom__">Custom location</option></select></label>{location==='__custom__'&&<label className="form-field">Custom location<input onChange={(event)=>setLocation(event.target.value)} placeholder="Enter venue" required /></label>}<label className="toggle-row"><span>Paid event</span><input type="checkbox" checked={isPaid} onChange={(event)=>setIsPaid(event.target.checked)}/></label>{isPaid&&<label className="form-field">Price<input type="number" min="0" value={price} onChange={(event)=>setPrice(event.target.value)} required /></label>}<label className="form-field">Status<select value={status} onChange={(event)=>setStatus(event.target.value)}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></label><label className="toggle-row"><span>Send notification on publish</span><input type="checkbox" checked={notifyOnPublish} onChange={(event)=>setNotifyOnPublish(event.target.checked)}/></label><button className="btn primary wide" type="submit" disabled={saving}>{saving?'Creating...':'Create Event'}</button></form></div>}
 </Page>
}

function MinistryApplications(){
  const [applications,setApplications]=useState([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const load=()=>fetchAdminApi('/api/admin/ministry-applications').then(({applications:items=[]})=>setApplications(items)).catch((requestError)=>setError(requestError.message)).finally(()=>setLoading(false))
  useEffect(()=>{load()},[])
  const updateStatus=(id,status)=>fetchAdminApi(`/api/admin/ministry-applications/${id}`,{method:'PATCH',body:JSON.stringify({status})}).then(({application})=>setApplications((items)=>items.map((item)=>item.id===application.id?application:item)))
  return <Page title="Ministry applications" subtitle="Review member requests to serve in GIC ministries"><Card className="table-card">{loading&&<div className="empty-message">Loading applications...</div>}{error&&<div className="empty-message">Applications are unavailable right now.</div>}{!loading&&!error&&!applications.length&&<div className="empty-message">No ministry applications yet.</div>}{!loading&&!error&&applications.map((application)=><div className="application-row" key={application.id}><div className="application-applicant">{application.applicant?.avatar?<img className="avatar" src={application.applicant.avatar} alt=""/>:<div className="avatar">{(application.applicant?.name||application.memberName||'?').slice(0,2).toUpperCase()}</div>}<div><b>{application.applicant?.name||application.memberName}</b><small>{application.applicant?.phone||'Phone not provided'} · {application.applicant?.email||'Email not provided'}</small><small>{application.applicant?.center||'Centre not provided'} · Member since {application.applicant?.joinedMonth&&application.applicant?.joinedYear?`${application.applicant.joinedMonth}/${application.applicant.joinedYear}`:'not provided'}</small><small>Already in: {application.applicant?.ministries||'No ministries recorded'}</small><strong>Applying for: {application.ministry}</strong>{application.message&&<p>{application.message}</p>}</div></div><span className={'badge '+(application.status==='APPROVED'?'success':application.status==='DECLINED'?'gray':'blue')}>{application.status}</span><div className="application-actions"><button className="tool" onClick={()=>updateStatus(application.id,'APPROVED')}>Approve</button><button className="tool" onClick={()=>updateStatus(application.id,'DECLINED')}>Decline</button></div></div>)}</Card></Page>
}

function LiveMembers(){
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('All Statuses')
 const [records,setRecords]=useState([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{fetchAdminApi('/api/admin/ministry-applications/members').then(({members=[]})=>setRecords(members)).catch((requestError)=>setError(requestError.message)).finally(()=>setLoading(false))},[])
 const visible=records.filter((member)=>`${member.displayName} ${member.phone||''} ${member.email||''} ${member.ministries||''} ${member.center||''}`.toLowerCase().includes(query.toLowerCase())&&(status==='All Statuses'||(member.active?'Active':'Inactive')===status))
 return <Page title="Members" subtitle="Live member records from the GIC platform"><Card className="table-card"><div className="member-toolbar"><div className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search live member records..."/></div><select value={status} onChange={(event)=>setStatus(event.target.value)}><option>All Statuses</option><option>Active</option><option>Inactive</option></select></div>{loading&&<div className="empty-message">Loading members...</div>}{error&&<div className="empty-message">Members are unavailable: {error}</div>}{!loading&&!error&&!visible.length&&<div className="empty-message">No live members found.</div>}{!loading&&!error&&visible.length>0&&<div className="table-wrap"><table><thead><tr><th>Member</th><th>Contact</th><th>Centre</th><th>Ministries</th><th>Member since</th><th>Birthday</th><th>Status</th><th>Last seen</th></tr></thead><tbody>{visible.map((member)=><tr key={member.id}><td><Link className="member-cell" to={`/members/${member.id}`}>{member.avatar?<img className="avatar" src={member.avatar} alt=""/>:<div className="avatar">{(member.displayName||'?').slice(0,2).toUpperCase()}</div>}<b>{member.displayName}</b></Link></td><td><span>{member.phone||'—'}</span><small className="table-subtext">{member.email||'—'}</small></td><td>{member.center||'—'}</td><td>{member.ministries||'—'}</td><td>{member.joinedMonth&&member.joinedYear?`${member.joinedMonth}/${member.joinedYear}`:'—'}</td><td>{member.birthday||'—'}</td><td><span className={'badge '+(member.active?'success':'gray')}>{member.active?'Active':'Inactive'}</span></td><td>{member.lastSeenAt?new Date(member.lastSeenAt).toLocaleString():'—'}</td></tr>)}</tbody></table></div>}</Card></Page>
}

function LiveMemberDetails(){
 const {id}=useParams()
 const [member,setMember]=useState(null)
 useEffect(()=>{fetchAdminApi('/api/admin/ministry-applications/members').then(({members=[]})=>setMember(members.find((item)=>item.id===id)||null)).catch(()=>setMember(null))},[id])
 if(!member)return <Page title="Member"><Card className="empty-message">Loading live member data...</Card></Page>
 return <Page title={member.displayName} subtitle={member.center||'Member profile'}><div className="detail-toolbar"><Link to="/members"><ArrowLeft size={16}/> Back to Members</Link></div><Card><div className="member-profile-header">{member.avatar?<img className="avatar member-avatar" src={member.avatar} alt=""/>:<div className="avatar member-avatar">{(member.displayName||'?').slice(0,2).toUpperCase()}</div>}<div><h2>{member.displayName}</h2><span className={'badge '+(member.active?'success':'gray')}>{member.active?'Active':'Inactive'}</span><p>Member since {member.joinedMonth&&member.joinedYear?`${member.joinedMonth}/${member.joinedYear}`:'not provided'}</p></div></div><div className="profile-section"><h3>Personal information</h3><div className="profile-fields"><div><small>Phone</small><b>{member.phone||'—'}</b></div><div><small>Email</small><b>{member.email||'—'}</b></div><div><small>Centre</small><b>{member.center||'—'}</b></div><div><small>Birthday</small><b>{member.birthday||'—'}</b></div><div><small>Service time</small><b>{member.serviceTime||'—'}</b></div><div><small>Membership status</small><b>{member.membershipStatus||'—'}</b></div><div><small>Last seen</small><b>{member.lastSeenAt?new Date(member.lastSeenAt).toLocaleString():'—'}</b></div></div></div><div className="profile-section"><h3>Groups / Ministries</h3><div className="tag-list">{(member.ministries||'').split(',').map((item)=>item.trim()).filter(Boolean).map((item)=><span className="tag" key={item}>{item}</span>)}</div>{!member.ministries&&<span className="muted">Not provided</span>}</div></Card></Page>
}

function LiveDashboard(){
 const [summary,setSummary]=useState({members:0,applications:0,messages:0,sentMessages:0,upcomingEvents:0,pendingApplications:0})
 const [error,setError]=useState('')
 useEffect(()=>{Promise.all([fetchAdminApi('/api/admin/ministry-applications/members'),fetchAdminApi('/api/admin/ministry-applications'),fetchAdminApi('/api/admin/notifications'),fetchAdminApi('/api/admin/events/summary')]).then(([memberData,applicationData,messageData,eventData])=>setSummary({members:memberData.members?.length||0,applications:applicationData.applications?.length||0,messages:messageData.items?.length||0,sentMessages:(messageData.items||[]).filter((item)=>['SENT','PARTIALLY_FAILED','FAILED'].includes(item.status)).length,upcomingEvents:eventData.upcomingEvents||0,pendingApplications:(applicationData.applications||[]).filter((item)=>item.status==='PENDING').length})).catch((requestError)=>setError(requestError.message))},[])
 return <Page title="Dashboard" subtitle="Live data from the GIC platform"><div className="stats"><Stat to="/members" label="Members" value={summary.members} change="Live records" icon={Users}/><Stat to="/ministry-applications" label="Ministry applications" value={summary.applications} change={`${summary.pendingApplications} pending`} icon={ClipboardList} type="green"/><Stat to="/messages" label="Notifications" value={summary.messages} change="Live campaigns" icon={Bell} type="blue"/><Stat to="/events" label="Published events" value={summary.upcomingEvents} change="Live records" icon={CalendarDays} type="orange"/><Stat to="/messages" label="Sent messages" value={summary.sentMessages} change="Filter by status in Messages" icon={Send} type="purple"/></div>{error&&<Card className="empty-message">Live dashboard data is unavailable right now.</Card>}</Page>
}

function AdminLogin(){
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [error,setError]=useState('')
 const [loading,setLoading]=useState(false)
 const submit=async(event)=>{
  event.preventDefault()
  setError('')
  setLoading(true)
  try{
   const credential=await signInWithEmailAndPassword(adminAuth,email,password)
   const tokenResult=await credential.user.getIdTokenResult(true)
   const role=String(tokenResult.claims.role||'').toUpperCase()
   const isAdmin=tokenResult.claims.admin===true||tokenResult.claims.isAdmin===true||role==='ADMIN'
   if(!isAdmin){
    await signOut(adminAuth)
    throw new Error('This account is not authorized for the admin dashboard.')
   }
  }catch(loginError){
   setError(loginError.message||'Unable to sign in')
  }finally{
   setLoading(false)
  }
 }
 return <main className="auth-screen"><form className="auth-card" onSubmit={submit}><Logo/><h1>Admin sign in</h1><p>Use your authorized GIC administrator account.</p><label>Email<input type="email" value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete="current-password" required/></label>{error&&<div className="auth-error" role="alert">{error}</div>}<button className="btn primary" type="submit" disabled={loading}>{loading?'Signing in...':'Sign in'}</button></form></main>
}

function AdminGate({children}){
 const [user,setUser]=useState(null)
 const [checking,setChecking]=useState(true)
 useEffect(()=>onAuthStateChanged(adminAuth,(nextUser)=>{setUser(nextUser);setChecking(false)}),[])
 if(checking)return <main className="auth-screen"><div className="auth-loading">Checking admin session...</div></main>
 if(!user)return <AdminLogin/>
 return children
}

export default function App(){
 return <AdminGate><Shell><Routes>
  <Route path="/" element={<LiveDashboard/>}/><Route path="/dashboard" element={<LiveDashboard/>}/>
  <Route path="/members" element={<LiveMembers/>}/><Route path="/members/:id" element={<LiveMemberDetails/>}/>
  <Route path="/events" element={<EventsUnavailable/>}/><Route path="/events/youth-conference-2024" element={<Placeholder title="Event details"/>}/>
  <Route path="/events/registrations" element={<Placeholder title="Event registrations"/>}/>
  <Route path="/messages" element={<Messages/>}/><Route path="/messages/:id" element={<MessageDetail/>}/><Route path="/messages/new" element={<NewMessage/>}/>
  <Route path="/settings" element={<Settings/>}/><Route path="/activity" element={<LiveActivityLog/>}/>
    <Route path="/ministry-applications" element={<MinistryApplications/>}/>
 </Routes></Shell></AdminGate>
}
