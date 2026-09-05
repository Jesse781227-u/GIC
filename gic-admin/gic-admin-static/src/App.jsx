import React, {useState} from 'react'
import {
  LayoutDashboard, Users, CalendarDays, MessageSquare, Settings as SettingsIcon, FileText,
  Activity, ChevronDown, ChevronRight, Plus, Search, Filter, Download,
  MoreHorizontal, UserPlus, Send, Bell, CalendarPlus, ClipboardList,
  FormInput, BarChart3, Shield, Database, Globe, Lock, CheckCircle2,
  Clock3, Eye, Edit3, Trash2, X, ArrowLeft, Save, Menu, LogOut
} from 'lucide-react'
import {Link, Routes, Route, useLocation, useNavigate, useParams} from 'react-router-dom'
import {ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell} from 'recharts'

const purple='#4b20b5'
const data=[{d:'Mon',v:220},{d:'Tue',v:410},{d:'Wed',v:430},{d:'Thu',v:700},{d:'Fri',v:780},{d:'Sat',v:1050},{d:'Sun',v:1580}]
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

function Logo(){
 return <div className="brand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
   <img 
     src="https://i.ibb.co/sJVFXvpS/RPap-R-removebg-preview.png" 
     alt="Global Impact Church" 
     style={{ height: '36px', width: 'auto', objectFit: 'contain' }}
   />
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
     <button className={'nav-item nav-button '+(active('/events')?'active':'')} onClick={()=>setOpen({...open,events:!open.events})}><CalendarDays size={17}/><span>Events</span><ChevronDown size={15} className={open.events?'':'rotated'}/></button>
     {open.events && <div className="subnav">{item('/events','All Events',CalendarDays)}{item('/events/registrations','Registrations',ClipboardList)}{item('/events/forms','Forms',FormInput)}</div>}
     <button className={'nav-item nav-button '+(active('/messages')?'active':'')} onClick={()=>setOpen({...open,messages:!open.messages})}><MessageSquare size={17}/><span>Messages</span><ChevronDown size={15} className={open.messages?'':'rotated'}/></button>
     {open.messages && <div className="subnav">{item('/messages','All Messages',MessageSquare)}{item('/messages/scheduled','Scheduled',Clock3)}</div>}
    <button className={'nav-item nav-button '+(active('/settings')?'active':'')} onClick={()=>setOpen({...open,settings:!open.settings})}><SettingsIcon size={17}/><span>Settings</span><ChevronDown size={15} className={open.settings?'':'rotated'}/></button>
    {open.settings && <div className="subnav">{item('/settings','General',SettingsIcon)}{item('/settings/users','Users & Roles',Shield)}{item('/settings/notifications','Notifications',Bell)}</div>}
   </div>
   <div className="other-label">OTHER</div>
   <div className="nav">{item('/reports','Reports',BarChart3)}{item('/activity','Activity Log',Activity)}</div>
   <div className="admin-box"><div className="avatar">A</div><div><b>Admin</b><small>Super Admin</small></div><ChevronDown size={14}/></div>
 </aside>
}

function Shell({children}){
 return <div className="app-shell"><Sidebar/><div className="workspace"><header className="topbar"><div className="mobile-brand"><Menu size={20}/><Logo/></div><div className="top-spacer"/><div className="date-picker">May 12 - May 18, 2024 <CalendarDays size={15}/></div><button className="quick"><Plus size={15}/> Quick Action</button></header>{children}</div></div>
}
function Page({title,subtitle,action,children}){
 return <main className="page"><div className="page-head"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</main>
}
function Card({children,className=''}){return <section className={'card '+className}>{children}</section>}
function Stat({label,value,change,icon:Icon,type='purple'}){return <Card className="stat"><div className={'stat-icon '+type}><Icon size={18}/></div><span>{label}</span><strong>{value}</strong><small className={change?.startsWith('↑')?'up':''}>{change}</small></Card>}

function Dashboard(){
 return <Page title="Dashboard" action={<button className="btn primary"><Plus size={15}/> Quick Action</button>}>
  <div className="stats"><Stat label="Total Members" value="2,458" change="↑ 12% vs last week" icon={Users}/><Stat label="Active Members" value="1,897" change="↑ 8% vs last week" icon={Users} type="green"/><Stat label="Events This Month" value="15" change="↑ 5 upcoming" icon={CalendarDays} type="orange"/><Stat label="Registrations" value="385" change="↑ 18% vs last week" icon={ClipboardList} type="blue"/></div>
  <div className="grid-2"><Card><div className="card-head"><b>Reports Overview</b><select><option>This Week</option><option>This Month</option></select></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="#eee" vertical={false}/><XAxis dataKey="d" fontSize={10}/><YAxis fontSize={10}/><Tooltip/><Line type="monotone" dataKey="v" stroke={purple} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></Card><Card><div className="card-head"><b>Registrations Overview</b></div><div className="donut-wrap"><ResponsiveContainer width="48%" height={170}><PieChart><Pie data={[{n:'Events',v:220},{n:'Forms',v:110},{n:'Ministries',v:55}]} dataKey="v" innerRadius={50} outerRadius={70}><Cell fill="#5b2fc1"/><Cell fill="#2daab4"/><Cell fill="#f39b28"/></Pie></PieChart></ResponsiveContainer><div className="donut-center"><strong>385</strong><span>Total</span></div><div className="legend"><div><i className="p"/><span>Events</span><b>220 (57%)</b></div><div><i className="t"/><span>Forms</span><b>110 (29%)</b></div><div><i className="o"/><span>Ministries</span><b>55 (14%)</b></div></div></div></Card></div>
  <div className="grid-3"><Card><div className="card-head"><b>Recent Registrations</b><a>View all</a></div>{members.slice(1,5).map((m,i)=><div className="mini-row" key={i}><div className="avatar">{m[0][0]}</div><div><b>{m[0]}</b><small>{['Youth Conference 2026',"Men's Fellowship",'Prayer Request Form','Volunteer Application'][i]}</small></div><time>May {18-i}, 2024</time></div>)}</Card><Card><div className="card-head"><b>Recent Messages</b><a>View all</a></div>{messages.slice(0,4).map((m,i)=><div className="mini-row icon-row" key={i}><div className="small-icon"><Send size={14}/></div><div><b>{m[0]}</b><small>{m[4]}</small></div><time>May {16-i}, 2024</time></div>)}</Card><Card><div className="card-head"><b>Quick Links</b></div>{[['Add New Member',UserPlus],['Create Event',CalendarPlus],['Send Message',Send],['View All Registrations',ClipboardList],['Create Form',FormInput]].map(([x,I])=><Link className="quick-link" to="#" key={x}><I size={15}/><span>{x}</span><ChevronRight size={14}/></Link>)}</Card></div>
 </Page>
}

function Toolbar({search='Search...', children}){return <div className="toolbar"><div className="search"><Search size={15}/><input placeholder={search}/></div>{children||<><button className="tool"><Filter size={14}/> Filter</button><button className="tool">All Status <ChevronDown size={13}/></button><button className="tool">All Ministries <ChevronDown size={13}/></button><button className="tool"><Download size={14}/> Export</button></>}</div>}

function Members(){
 return <Page title="Members" subtitle="Manage and view all church members" action={<button className="btn primary"><Plus size={15}/> Add Member</button>}><Card className="table-card"><Toolbar search="Search members..."/><div className="table-wrap"><table><thead><tr><th><input type="checkbox"/></th><th>Member</th><th>Contact</th><th>Ministries</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{members.map((m,i)=><tr key={i}><td><input type="checkbox"/></td><td><div className="member-cell"><div className="avatar">{m[0].split(' ').map(x=>x[0]).join('')}</div><b>{m[0]}</b></div></td><td>{m[1]}</td><td>{m[2]}</td><td><span className={'badge '+(m[3]==='Active'?'success':'gray')}>{m[3]}</span></td><td>{m[4]}</td><td><button className="icon-btn"><MoreHorizontal size={17}/></button></td></tr>)}</tbody></table></div><div className="pagination"><span>Showing 1 to 8 of 2,458 members</span><div><button>‹</button><button className="current">1</button><button>2</button><button>3</button><button>…</button><button>307</button><button>›</button></div></div></Card></Page>
}

function Events(){
 return <Page title="Events" subtitle="Manage church events" action={<button className="btn primary"><Plus size={15}/> Create Event</button>}><Card className="table-card"><div className="tabs"><button className="active">All Events</button><button>Upcoming</button><button>Ongoing</button><button>Past</button></div><Toolbar search="Search events..."/><div className="event-list">{events.map((e,i)=><Link className="event-admin-row" to={i===0?'/events/youth-conference-2024':'#'} key={e[0]}><img src={e[5]}/><div className="event-info"><b>{e[0]}</b><small><CalendarDays size={12}/>{e[1]} <span>•</span> <MapPinIcon/>{e[2]}</small></div><div className="reg-count"><b>{e[3]}</b><small>Registrations</small></div><span className={'badge '+(e[4]==='Published'?'success':'draft')}>{e[4]}</span><MoreHorizontal size={17}/></Link>)}</div><div className="pagination"><span>Showing 1 to 6 of 15 events</span><div><button>‹</button><button className="current">1</button><button>2</button><button>3</button><button>›</button></div></div></Card></Page>
}
function MapPinIcon(){return <span>⌖</span>}

function EventDetail(){
 return <Page title="Youth Conference 2026" subtitle="Manage this event"><div className="detail-toolbar"><Link to="/events"><ArrowLeft size={16}/> Back to Events</Link><div><button className="btn secondary"><Edit3 size={14}/> Edit</button><button className="btn primary"><Send size={14}/> Send Reminder</button></div></div><Card><div className="event-detail-top"><img src={events[0][5]}/><div><span className="badge success">Published</span><h2>Youth Conference 2026</h2><p><CalendarDays size={14}/> Oct 24, 2026 • 10:00 AM</p><p>⌖ Main Auditorium</p><p>432 registrations</p></div></div><div className="tabs big"><button className="active">Overview</button><button>Registrations</button><button>Forms</button><button>Attendance</button><button>Reminders</button></div><div className="event-stats"><Stat label="Registrations" value="432" change="↑ 18% this week" icon={ClipboardList}/><Stat label="Checked In" value="287" change="66% attendance" icon={CheckCircle2} type="green"/><Stat label="Pending" value="145" change="Awaiting attendance" icon={Clock3} type="orange"/></div></Card></Page>
}

function Messages(){
 return <Page title="Messages" subtitle="Send messages and announcements" action={<button className="btn primary"><Plus size={15}/> New Message</button>}><Card className="table-card"><div className="tabs"><button className="active">All Messages</button><button>Scheduled</button><button>Sent</button><button>Drafts</button></div><Toolbar search="Search messages..."><button className="tool"><Filter size={14}/> Filter</button></Toolbar><div className="message-list">{messages.map((m,i)=><Link className="message-row" to={i===0?'/messages/1':'#'} key={m[0]}><div className={'message-icon '+(m[2]==='Sent'?'sent':'')}>{m[2]==='Sent'?<Send size={16}/>:m[2]==='Scheduled'?<CalendarDays size={16}/>:<FileText size={16}/>}</div><div className="message-main"><b>{m[0]}</b><small>{m[1]}</small></div><span className={'badge '+(m[2]==='Sent'?'success':m[2]==='Scheduled'?'blue':'gray')}>{m[2]}</span><time>{m[3]}</time><small>To: {m[4]}</small><MoreHorizontal size={17}/></Link>)}</div></Card></Page>
}

function MessageDetail(){
 return <Page title="Sunday Service Update" subtitle="Message details"><div className="detail-toolbar"><Link to="/messages"><ArrowLeft size={16}/> Back to Messages</Link><div><button className="btn secondary"><Edit3 size={14}/> Duplicate</button></div></div><Card className="message-preview"><div className="message-status"><span className="badge success">Sent</span><span>May 16, 2024</span></div><h2>Sunday Service Update</h2><p>Join us this Sunday for a powerful time in God's presence.</p><div className="audience"><Users size={15}/> Sent to <b>All Members</b></div></Card></Page>
}

function Settings(){
 const [saved,setSaved]=useState(false)
 return <Page title="Settings" subtitle="Manage system settings and preferences"><div className="settings-layout"><Card className="settings-nav">{[['General',SettingsIcon],['Church Information',Globe],['Users & Roles',Users],['Notifications',Bell],['Security',Lock],['Integrations',Database],['Backup',Database]].map(([x,I],i)=><button className={i===0?'active':''} key={x}><I size={16}/>{x}</button>)}</Card><Card className="settings-form"><div className="card-head"><div><b>General Settings</b><small>Manage your church's general information</small></div></div><div className="form-grid"><label>Church Name<input defaultValue="Global Impact Church"/></label><label>Church Email<input defaultValue="info@globalimpactng.org"/></label><label>Church Phone<input defaultValue="+234 801 234 5678"/></label><label>Timezone<select defaultValue="(GMT+01:00) West Africa Time"><option>(GMT+01:00) West Africa Time</option></select></label><label>Date Format<select defaultValue="May 18, 2024"><option>May 18, 2024</option></select></label><label>Time Format<select defaultValue="12 Hour (AM/PM)"><option>12 Hour (AM/PM)</option></select></label><label>Language<select defaultValue="English"><option>English</option></select></label></div><div className="save-row">{saved&&<span className="saved"><CheckCircle2 size={14}/> Changes saved</span>}<button className="btn primary" onClick={()=>setSaved(true)}><Save size={14}/> Save Changes</button></div></Card></div></Page>
}

function Placeholder({title}){return <Page title={title}><Card className="empty"><Activity size={30}/><h2>{title}</h2><p>This static screen is included as a navigation placeholder and is ready for backend integration.</p></Card></Page>}

export default function App(){
 return <Shell><Routes>
   <Route path="/" element={<Dashboard/>}/><Route path="/dashboard" element={<Dashboard/>}/>
   <Route path="/members" element={<Members/>}/>
   <Route path="/events" element={<Events/>}/><Route path="/events/youth-conference-2024" element={<EventDetail/>}/>
   <Route path="/events/registrations" element={<Placeholder title="Registrations"/>}/><Route path="/events/forms" element={<Placeholder title="Forms"/>}/>
   <Route path="/messages" element={<Messages/>}/><Route path="/messages/1" element={<MessageDetail/>}/><Route path="/messages/scheduled" element={<Placeholder title="Scheduled Messages"/>}/>
   <Route path="/settings" element={<Settings/>}/><Route path="/settings/users" element={<Placeholder title="Users & Roles"/>}/><Route path="/settings/notifications" element={<Placeholder title="Notification Settings"/>}/>
   <Route path="/reports" element={<Placeholder title="Reports"/>}/><Route path="/activity" element={<Placeholder title="Activity Log"/>}/>
 </Routes></Shell>
}
