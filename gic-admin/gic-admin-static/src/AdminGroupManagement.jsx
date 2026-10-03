import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, RefreshCw, Users, Search, Layers3 } from 'lucide-react'
import { adminAuth } from './firebase'
import './admin-organizations.css'

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
const emptyAgeGroupForm = { name: '', minAge: '13', maxAge: '17', active: true }
const initialRule = { field: 'age_group_id', operator: 'equals', value: '' }

export default function AdminGroupManagement() {
  const [tab, setTab] = useState('segments')
  const [data, setData] = useState({ segments: [], ministries: [], cells: [], ageGroups: [] })
  const [members, setMembers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [ageGroupForm, setAgeGroupForm] = useState(emptyAgeGroupForm)
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
  const [query, setQuery] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [ageGroupQuery, setAgeGroupQuery] = useState('')

  const load = async () => {
    const [groups, memberData] = await Promise.all([groupsApi('/api/admin/groups'), groupsApi('/api/admin/ministry-applications/members')])
    setData(groups)
    setMembers(memberData.members || [])
  }
  useEffect(() => { load().catch((loadError) => setError(loadError.message || 'Groups could not be loaded.')) }, [])

  const resetForm = () => { setForm(emptyForm); setAgeGroupForm(emptyAgeGroupForm); setSegmentType('automatic'); setLogic('and'); setRules([{ ...initialRule }]); setEditing(null) }
  const save = async (event) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true)
    try {
      if (tab === 'ageGroups') {
        const payload = { name: ageGroupForm.name.trim(), minAge: Number(ageGroupForm.minAge), maxAge: ageGroupForm.maxAge === '' ? null : Number(ageGroupForm.maxAge), active: ageGroupForm.active }
        await groupsApi(editing ? `/api/admin/groups/age-groups/${editing.id}` : '/api/admin/groups/age-groups', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      } else if (tab === 'segments') {
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
          if (['gender','age_group_id','relationship_status'].includes(rule.field)) return { field: rule.field, operator: 'equals', value: rule.value }
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
    if (tab === 'ageGroups') {
      setAgeGroupForm({ name: item.name, minAge: String(item.minAge), maxAge: item.maxAge === null ? '' : String(item.maxAge), active: item.active })
    } else if (tab === 'segments') {
      setSegmentType(item.segmentType); setLogic(item.rules?.logic || 'and')
      setRules(item.rules?.conditions?.length ? item.rules.conditions.map((condition) => ({...initialRule,...condition})) : [{...initialRule}])
    } else if (tab === 'cells') {
      setRules(item.eligibilityRules?.conditions?.length ? item.eligibilityRules.conditions.map((condition) => ({...initialRule,...condition})) : [{...initialRule}])
    }
  }

  const deactivate = async (item) => {
    if (item.isSystem) return
    setError(''); setNotice('')
    try {
      if (tab === 'ageGroups') await groupsApi(`/api/admin/groups/age-groups/${item.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) })
      else await groupsApi(`/api/admin/groups/${tab}/${item.id}`, { method: 'DELETE' })
      setNotice(tab === 'ageGroups' ? 'Age group deactivated.' : 'Group deactivated.')
      await load()
    }
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

  const reviewEligibility = async (personId) => {
    if (!selected || tab !== 'cells') return
    try {
      await groupsApi(`/api/admin/groups/cells/${selected.id}/members/${encodeURIComponent(personId)}/review`, { method: 'POST' })
      await inspect(selected)
    } catch (requestError) { setError(requestError.message || 'Eligibility review could not be recorded.') }
  }

  const list = tab === 'ageGroups' ? (data.ageGroups || []) : (data[tab] || [])
  const visibleList = tab === 'segments'
    ? list.filter((item) => (segmentFilter === 'all' || item.segmentType === segmentFilter) && `${item.name} ${item.description || ''}`.toLowerCase().includes(query.toLowerCase()))
    : tab === 'ageGroups' ? list.filter((item) => `${item.name} ${item.minAge} ${item.maxAge ?? ''}`.toLowerCase().includes(ageGroupQuery.toLowerCase())) : list
  const ruleFields = tab === 'segments' ? ['gender','age_group_id','relationship_status','joined_within_months','center','membership_status','ministry_id','cell_id'] : ['gender','age_group_id','relationship_status']
  const changeRule = (index, key, value) => setRules((items) => items.map((item, current) => {
    if (current !== index) return item
    if (key !== 'field') return { ...item, [key]: value }
    if (value === 'joined_within_months') return { ...item, field: value, operator: 'within', value: 5 }
    if (value === 'age') return { ...item, field: value, operator: 'between', min: 18, max: 30, value: '' }
    if (value === 'age_group_id' || value === 'relationship_status') return { ...item, field: value, operator: 'equals', value: '' }
    if (value === 'ministry_id' || value === 'cell_id') return { ...item, field: value, operator: 'equals', value: '' }
    if (value === 'gender') return { ...item, field: value, operator: 'equals', value: 'female' }
    return { ...item, field: value, operator: 'equals', value: '' }
  }))

  return <main className="page">
    <div className="page-head"><div><h1>Segments</h1><p>Audience classifications for member communications</p></div><Link className="btn secondary" to="/ministries"><ArrowLeft size={14}/> Units</Link></div>
    <div className="tabs big">{[['segments','Segments'],['ageGroups','Age Groups']].map(([value,label]) => <button key={value} className={tab===value?'active':''} onClick={() => {setTab(value);setSelected(null);resetForm()}}>{label}</button>)}</div>
    {error && <div className="empty-message" role="alert">{error}</div>}{notice && <div className="empty-message" role="status">{notice}</div>}
    {tab==='segments'&&<section className="organization-toolbar segment-toolbar"><label className="search"><Search size={15}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search segments..."/></label><select aria-label="Filter segment type" value={segmentFilter} onChange={(event)=>setSegmentFilter(event.target.value)}><option value="all">All types</option><option value="automatic">Automatic</option><option value="manual">Manual</option></select><span>{visibleList.length} segments</span><button className="btn primary" onClick={()=>{resetForm();setSelected(null)}}><Plus size={15}/> New segment</button></section>}
    {tab==='ageGroups'&&<section className="organization-toolbar segment-toolbar"><label className="search"><Search size={15}/><input value={ageGroupQuery} onChange={(event)=>setAgeGroupQuery(event.target.value)} placeholder="Search age groups..."/></label><span>{visibleList.length} age groups</span><button className="btn primary" onClick={resetForm}><Plus size={15}/> New age group</button></section>}
    <div className={tab==='segments'?'segment-management-layout':tab==='ageGroups'?'age-group-management-layout':'grid-2'}>
      <section className={tab==='segments'?'segment-directory':'card table-card'}>
        {tab!=='segments'&&<div className="card-head"><div><b>{tab[0].toUpperCase()+tab.slice(1)}</b><small>{list.length} groups</small></div><button className="tool" onClick={() => load().catch((err)=>setError(err.message))}><RefreshCw size={14}/> Refresh</button></div>}
        {tab==='segments'?<div className="organization-directory segment-cards">{visibleList.map((item)=><article className="organization-card" key={item.id}><div className="organization-card-head"><span className="organization-symbol"><Layers3 size={17}/></span><span className={`badge ${item.active?'success':'gray'}`}>{item.active?'Active':'Inactive'}</span></div><h2>{item.name}</h2><span className="organization-type">{item.segmentType==='automatic'?'Automatic segment':'Manual segment'}{item.isSystem?' · System':''}</span><p>{item.description||`${item.rules?.conditions?.length||0} matching rules`}</p><div className="organization-card-meta"><span><Users size={14}/>{item.memberCount??0} members</span><span>{item.rules?.conditions?.length||0} rules</span></div><div className="segment-card-actions"><button className="tool" onClick={()=>inspect(item)}>Members</button><button className="tool" onClick={()=>edit(item)}>Edit</button>{!item.isSystem&&item.active&&<button className="tool" onClick={()=>deactivate(item)}>Deactivate</button>}</div></article>)}{!visibleList.length&&<div className="empty-message">No matching segments.</div>}</div>:tab==='ageGroups'?<div className="organization-directory segment-cards age-group-cards">{visibleList.map((item)=><article className="organization-card" key={item.id}><div className="organization-card-head"><span className="organization-symbol"><Users size={17}/></span><span className={`badge ${item.active?'success':'gray'}`}>{item.active?'Active':'Inactive'}</span></div><h2>{item.name}</h2><span className="organization-type">Age group</span><p>{item.minAge} years and over{item.maxAge===null?'':` · up to ${item.maxAge} years`}</p><div className="organization-card-meta"><span>{item.active?'Available for member profiles':'Inactive'}</span></div><div className="segment-card-actions"><button className="tool" onClick={()=>edit(item)}>Edit</button></div></article>)}{!visibleList.length&&<div className="empty-message">No matching age groups.</div>}</div>:list.map((item) => <div className="application-row" key={item.id}><div className="application-applicant"><div className="avatar"><Users size={16}/></div><div><b>{item.name} {item.isSystem && <span className="badge blue">System</span>}</b><small>{item.description || 'Group'}</small><small>{item.memberCount ?? 0} members · {item.active ? 'Active' : 'Inactive'}</small></div></div><div className="application-actions"><button className="tool" onClick={()=>edit(item)}>Edit</button></div></div>)}
        {tab!=='segments'&&!list.length&&<div className="empty-message">No {tab} configured.</div>}
      </section>
      <section className="card settings-form"><div className="card-head"><div><b>{editing ? `Edit ${tab.slice(0,-1)}` : `Create ${tab.slice(0,-1)}`}</b><small>Changes apply to future message audiences.</small></div></div>
        <form className="stack" onSubmit={save}>
          {tab==='ageGroups' ? <><label className="form-field">Age group name<input value={ageGroupForm.name} onChange={(event)=>setAgeGroupForm({...ageGroupForm,name:event.target.value})} required maxLength={80}/></label><div className="form-grid"><label className="form-field">Minimum age<input type="number" min="0" max="120" value={ageGroupForm.minAge} onChange={(event)=>setAgeGroupForm({...ageGroupForm,minAge:event.target.value})} required/></label><label className="form-field">Maximum age (blank means no upper limit)<input type="number" min={ageGroupForm.minAge} max="120" value={ageGroupForm.maxAge} onChange={(event)=>setAgeGroupForm({...ageGroupForm,maxAge:event.target.value})}/></label></div>{editing&&<label className="toggle-row"><span>Active</span><input type="checkbox" checked={ageGroupForm.active} onChange={(event)=>setAgeGroupForm({...ageGroupForm,active:event.target.checked})}/></label>}</> : <label className="form-field">Name<input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} required maxLength={120}/></label>}
          {tab!=='ageGroups'&&<label className="form-field">Description<textarea value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} rows="3"/></label>}
          {tab !== 'segments' && tab !== 'ageGroups' && <label className="form-field">Image URL (optional)<input type="url" value={form.imageUrl} onChange={(event)=>setForm({...form,imageUrl:event.target.value})} placeholder="https://..."/></label>}
          {editing && tab!=='ageGroups' && <label className="toggle-row"><span>Active</span><input type="checkbox" checked={form.active} disabled={Boolean(editing.isSystem)} onChange={(event)=>setForm({...form,active:event.target.checked})}/></label>}
          {tab==='segments' && !editing && <label className="form-field">Segment type<select value={segmentType} onChange={(event)=>setSegmentType(event.target.value)}><option value="automatic">Automatic</option><option value="manual">Manual</option></select></label>}
          {(tab==='cells' || (tab==='segments' && (editing?.segmentType || segmentType)==='automatic')) && <div className="composer-section"><b>{tab==='cells'?'Eligibility rules':'Automatic segment criteria'}</b>{tab==='segments'&&<label className="form-field">Combine criteria<select value={logic} onChange={(event)=>setLogic(event.target.value)}><option value="and">Match all (AND)</option><option value="or">Match any (OR)</option></select></label>}{rules.map((rule,index)=><div className="form-grid" key={index}><label className="form-field">Field<select value={rule.field} onChange={(event)=>changeRule(index,'field',event.target.value)}>{ruleFields.map((field)=><option key={field} value={field}>{field.replaceAll('_',' ')}</option>)}</select></label>{['ministry_id','cell_id'].includes(rule.field)?<label className="form-field">Group<select value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="">Choose {rule.field==='ministry_id'?'ministry':'cell'}</option>{(rule.field==='ministry_id'?data.ministries:data.cells).filter((item)=>item.active).map((item,index)=><option key={item.id} value={item.id}>{item.name}: {item.minAge}–{item.maxAge ?? '+'}</option>)}</select></label>:rule.field==='age_group_id'?<label className="form-field">Age group<select value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="">Choose age group</option>{(data.ageGroups||[]).filter((item)=>item.active).map((item)=><option key={item.id} value={item.id}>{item.name}: {item.minAge}–{item.maxAge ?? '+'}</option>)}</select></label>:rule.field==='relationship_status'?<label className="form-field">Relationship status<select value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="">Choose status</option><option value="Single">Single</option><option value="Married">Married</option></select></label>:['gender','center','membership_status'].includes(rule.field)?<label className="form-field">Value{rule.field==='gender'?<select value={rule.value||'female'} onChange={(event)=>changeRule(index,'value',event.target.value)}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select>:<input value={rule.value||''} onChange={(event)=>changeRule(index,'value',event.target.value)}/>}</label>:rule.field==='joined_within_months'?<label className="form-field">Months<input type="number" min="1" max="240" value={rule.value||5} onChange={(event)=>changeRule(index,'value',event.target.value)}/></label>:<><label className="form-field">Minimum age<input type="number" min="0" max="120" value={rule.min||18} onChange={(event)=>changeRule(index,'min',event.target.value)}/></label><label className="form-field">Maximum age<input type="number" min="0" max="120" value={rule.max||30} onChange={(event)=>changeRule(index,'max',event.target.value)}/></label></>}{tab==='segments'&&<button type="button" className="tool" onClick={()=>setRules((items)=>items.filter((_,current)=>current!==index))}>Remove</button>}</div>)}{tab==='segments'&&<button type="button" className="tool" onClick={()=>setRules((items)=>[...items,{...initialRule}])}><Plus size={14}/> Add criteria</button>}</div>}
          <div className="save-row"><button type="button" className="btn secondary" onClick={resetForm}>New</button><button className="btn primary" disabled={busy}>{busy?'Saving…':'Save'}</button></div>
        </form>
        {selected && <div className="profile-section"><h3>{selected.name} members ({selectedMembers.length})</h3>{((tab==='segments'&&selected.segmentType==='manual')||tab==='ministries'||tab==='cells')&&<div className="composer-grid"><select value={memberId} onChange={(event)=>setMemberId(event.target.value)}><option value="">Select member</option>{members.map((person)=><option key={person.id} value={person.id}>{person.displayName} · {person.phone||'No phone'}</option>)}</select><button className="tool" disabled={!memberId} onClick={()=>updateMembership(memberId,true)}>Add member</button></div>}{selectedMembers.map((person)=><div className="application-row" key={person.id}><b>{person.displayName}</b>{person.eligibilityReviewRequired&&<><span className="badge orange">Review eligibility</span><button className="tool" onClick={()=>reviewEligibility(person.id)}>Mark reviewed</button></>}{((tab==='segments'&&selected.segmentType==='manual')||tab==='ministries'||tab==='cells')&&<button className="tool" onClick={()=>updateMembership(person.id,false)}>Remove</button>}</div>)}</div>}
      </section>
    </div>
  </main>
}
