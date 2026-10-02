import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, RefreshCw, Users } from 'lucide-react'
import { adminAuth } from './firebase'

const API_BASE = import.meta.env.VITE_API_URL || 'https://gic-backend-lx3q.onrender.com'

async function groupsApi(path, options = {}) {
  const user = adminAuth.currentUser
  if (!user) throw new Error('Admin session is unavailable')
  const token = await user.getIdToken()
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const text = await response.text().catch(() => 'Request failed')
    try { throw new Error(JSON.parse(text).error || text) } catch (error) { if (error instanceof SyntaxError) throw new Error(text); throw error }
  }
  return response.json()
}

const emptyForm = { name: '', description: '', imageUrl: '', active: true }
const initialRule = { field: 'gender', operator: 'equals', value: 'female', min: 18, max: 30 }

export default function AdminGroupManagement() {
  const [tab, setTab] = useState('segments')
  const [data, setData] = useState({ segments: [], ministries: [], cells: [] })
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [segmentType, setSegmentType] = useState('automatic')
  const [logic, setLogic] = useState('and')
  const [rules, setRules] = useState([{ ...initialRule }])
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [selectedMembers, setSelectedMembers] = useState([])
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [groups, memberData] = await Promise.all([groupsApi('/api/admin/groups'), groupsApi('/api/admin/ministry-applications/members')])
    setData(groups)
    setMembers(memberData.members || [])
  }
  useEffect(() => { load().catch((loadError) => setError(loadError.message || 'Groups could not be loaded.')) }, [])

  const resetForm = () => { setForm(emptyForm); setSegmentType('automatic'); setLogic('and'); setRules([{ ...initialRule }]); setEditing(null) }
  const save = async (event) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      if (tab === 'segments') {
        const path = editing ? `/api/admin/groups/segments/${editing.id}` : '/api/admin/groups/segments'
        const method = editing ? 'PATCH' : 'POST'
        const activeSegmentType = editing?.segmentType || segmentType
        const conditions = rules.map(({ field, operator, value, min, max }) => ({
          field,
          operator,
          ...(value !== '' ? { value: field === 'joined_within_months' ? Number(value) : value } : {}),
          ...(field === 'age' ? { min: Number(min), max: Number(max) } : {}),
        }))
        const payload = { ...form, ...(editing ? {} : { segmentType }), ...(activeSegmentType === 'automatic' ? { rules: { logic, conditions } } : {}) }
        await groupsApi(path, { method, body: JSON.stringify(payload) })
      } else {
        const kind = tab === 'ministries' ? 'ministries' : 'cells'
        const eligibilityConditions = rules.filter((rule) => rule.field).map((rule) => {
          if (rule.field === 'gender') return { field: 'gender', operator: 'equals', value: rule.value }
          return { field: 'age', operator: 'between', min: Number(rule.min), max: Number(rule.max) }
        })
        const payload = { ...form }
        if (kind === 'cells') payload.eligibilityRules = { logic: 'and', conditions: eligibilityConditions }
        await groupsApi(editing ? `/api/admin/groups/${kind}/${editing.id}` : `/api/admin/groups/${kind}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      }
      resetForm(); setNotice('Changes saved.'); await load()
    } catch (saveError) { setError(saveError.message || 'Could not save changes.') }
    finally { setBusy(false) }
  }

  const edit = (item) => {
    setEditing(item); setForm({ name: item.name, description: item.description || '', imageUrl: item.imageUrl || '', active: item.active })
    if (tab === 'segments') {
      setSegmentType(item.segmentType); setLogic(item.rules?.logic || 'and')
      setRules(item.rules?.conditions?.length ? item.rules.conditions.map((condition) => ({...initialRule,...condition})) : [{...initialRule}])
    } else if (tab === 'cells') {
      setRules(item.eligibilityRules?.conditions?.length ? item.eligibilityRules.conditions.map((condition) => ({...initialRule,...condition})) : [{...initialRule}])
    }
  }

  const deactivate = async (item) => {
    if (item.isSystem) return
    setError(''); setNotice('')
    try { await groupsApi(`/api/admin/groups/${tab}/${item.id}`, { method: 'DELETE' }); setNotice('Group deactivated.'); await load() }
    catch (requestError) { setError(requestError.message || 'Could not deactivate group.') }
  }

  const inspect = async (item) => {
    setSelected(item); setError(''); setSelectedMembers([])
    try {
      if (tab === 'segments') {
        const result = await groupsApi(`/api/admin/groups/segments/${item.id}/members`)
        setSelectedMembers(result.members || [])
      } else {
        const type = tab === 'ministries' ? 'ministries' : 'cells'
        const result = await groupsApi(`/api/admin/groups/${type}/${item.id}/members`)
        setSelectedMembers(result.members || [])
      }
    } catch (requestError) { setError(requestError.message || 'Members could not be loaded.') }
  }

  const updateMembership = async (personId, add) => {
    if (!selected) return
    const base = `/api/admin/groups/${tab}/${selected.id}/members`
    try {
      await groupsApi(add ? base : `${base}/${encodeURIComponent(personId)}`, { method: add ? 'POST' : 'DELETE', ...(add ? {body:JSON.stringify({memberId:personId})} : {}) })
      await inspect(selected); await load()
    } catch (requestError) { setError(requestError.message || 'Membership could not be changed.') }
  }

  const list = data[tab] || []
  const ruleFields = tab === 'segments' ? ['gender','age','joined_within_months','center','membership_status','ministry_id','cell_id'] : ['gender','age']
  const changeRule = (index, key, value) => setRules((items) => items.map((item, current) => {
    if (current !== index) return item
    if (key !== 'field') return { ...item, [key]: value }
    if (value === 'joined_within_months') return { ...item, field: value, operator: 'within', value: 5 }
    if (value === 'age') return { ...item, field: value, operator: 'between', min: 18, max: 30, value: '' }
    if (value === 'ministry_id' || value === 'cell_id') return { ...item, field: value, operator: 'equals', value: '' }
    if (value === 'gender') return { ...item, field: value, operator: 'equals', value: 'female' }
    return { ...item, field: value, operator: 'equals', value: '' }
  }))

  return <main className="page">
    <div className="page-head"><div><h1>Segments, Ministries & Cells</h1><p>Manage groups and messaging audiences for this church.</p></div><Link className="btn secondary" to="/ministry-applications"><ArrowLeft size={14}/> Applications</Link></div>
    <div className="tabs big">{[['segments','Segments'],['ministries','Ministries'],['cells','Cells']].map(([value,label]) => <button key={value} className={tab===value?'active':''} onClick={() => {setTab(value);setSelected(null);resetForm()}}>{label}</button>)}</div>
    {error && <div className="empty-message" role="alert">{error}</div>}{notice && <div className="empty-message" role="status">{notice}</div>}
    <div className="grid-2">
      <section className="card table-card"><div className="card-head"><div><b>{tab[0].toUpperCase()+tab.slice(1)}</b><small>{list.length} groups</small></div><button className="tool" onClick={() => load().catch((err)=>setError(err.message))}><RefreshCw size={14}/> Refresh</button></div>
        {list.map((item) => <div className="application-row" key={item.id}><div className="application-applicant"><div className="avatar"><Users size={16}/></div><div><b>{item.name} {item.isSystem && <span className="badge blue">System</span>}</b><small>{tab==='segments' ? `${item.segmentType} · ${item.rules?.conditions?.length || 0} rules` : item.description || (tab==='cells' ? 'Open cell' : 'Ministry')}</small><small>{item.memberCount ?? 0} members · {item.active ? 'Active' : 'Inactive'}</small></div></div><div className="application-actions"><button className="tool" onClick={()=>inspect(item)}>Members</button><button className="tool" onClick={()=>edit(item)}>Edit</button>{!item.isSystem && item.active && <button className="tool" onClick={()=>deactivate(item)}>Deactivate</button>}</div></div>)}
        {!list.length && <div className="empty-message">No {tab} configured.</div>}
      </section>
      <section className="card settings-form"><div className="card-head"><div><b>{editing ? `Edit ${tab.slice(0,-1)}` : `Create ${tab.slice(0,-1)}`}</b><small>Changes apply to future message audiences.</small></div></div>
        <form className="stack" onSubmit={save}>
          <label className="form-field">Name<input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} required maxLength={120}/></label>
          <label className="form-field">Description<textarea value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} rows="3"/></label>
          {tab !== 'segments' && <label className="form-field">Image URL (optional)<input type="url" value={form.imageUrl} onChange={(event)=>setForm({...form,imageUrl:event.target.value})} placeholder="https://..."/></label>}
          {editing && <label className="toggle-row"><span>Active</span><input type="checkbox" checked={form.active} disabled={Boolean(editing.isSystem)} onChange={(event)=>setForm({...form,active:event.target.checked})}/></label>}
          {tab==='segments' && !editing && <label className="form-field">Segment type<select value={segmentType} onChange={(event)=>setSegmentType(event.target.value)}><option value="automatic">Automatic</option><option value="manual">Manual</option></select></label>}
          {(tab==='cells' || (tab==='segments' && (editing?.segmentType || segmentType)==='automatic')) && <div className="composer-section"><b>{tab==='cells'?'Eligibility rules':'Automatic segment criteria'}</b>{tab==='segments'&&<label className="form-field">Combine criteria<select value={logic} onChange={(event)=>setLogic(event.target.value)}><option value="and">Match all (AND)</option><option value="or">Match any (OR)</option></select></label>}{rules.map((rule,index)=><div className="form-grid" key={index}><label className="form-field">Field<select value={rule.field} onChange={(event)=>changeRule(index,'field',event.target.value)}>{ruleFields.map((field)=><option key={field} value={field}>{field.replaceAll('_',' ')}</option>)}</select></label>{['ministry_id','cell_id'].includes(rule.field)?<label className="form-field">Group<select value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="">Choose {rule.field==='ministry_id'?'ministry':'cell'}</option>{(rule.field==='ministry_id'?data.ministries:data.cells).filter((item)=>item.active).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>:['gender','center','membership_status'].includes(rule.field)?<label className="form-field">Value{rule.field==='gender'?<select value={rule.value||'female'} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>:<input value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}/>}</label>:rule.field==='joined_within_months'?<label className="form-field">Months<input type="number" min="1" max="240" value={rule.value||5} onChange={(event)=>changeRule(index,'value',event.target.value)}/></label>:<><label className="form-field">Minimum age<input type="number" min="0" max="120" value={rule.min||18} onChange={(event)=>changeRule(index,'min',event.target.value)}/></label><label className="form-field">Maximum age<input type="number" min="0" max="120" value={rule.max||30} onChange={(event)=>changeRule(index,'max',event.target.value)}/></label></>}{tab==='segments'&&<button type="button" className="tool" onClick={()=>setRules((items)=>items.filter((_,current)=>current!==index))}>Remove</button>}</div>)}{tab==='segments'&&<button type="button" className="tool" onClick={()=>setRules((items)=>[...items,{...initialRule}])}><Plus size={14}/> Add criteria</button>}</div>}
          <div className="save-row"><button type="button" className="btn secondary" onClick={resetForm}>New</button><button className="btn primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div>
        </form>
        {selected && <div className="profile-section"><h3>{selected.name} members ({selectedMembers.length})</h3>{((tab==='segments'&&selected.segmentType==='manual')||tab==='ministries'||tab==='cells')&&<div className="composer-grid"><select value={memberId} onChange={(event)=>setMemberId(event.target.value)}><option value="">Select member</option>{members.map((person)=><option key={person.id} value={person.id}>{person.displayName} · {person.phone||'No phone'}</option>)}</select><button className="tool" disabled={!memberId} onClick={()=>updateMembership(memberId,true)}>Add member</button></div>}{selectedMembers.map((person)=><div className="application-row" key={person.id}><b>{person.displayName}</b>{((tab==='segments'&&selected.segmentType==='manual')||tab==='ministries'||tab==='cells')&&<button className="tool" onClick={()=>updateMembership(person.id,false)}>Remove</button>}</div>)}</div>}
      </section>
    </div>
  </main>
}
