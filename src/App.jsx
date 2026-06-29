import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, ReferenceLine, Line, Area,
} from 'recharts';
import { LayoutGrid, PieChart as PieChartIcon, TrendingUp, Compass, BookOpen, Settings, Zap, Trash2, Plus, Edit3, StickyNote, GripVertical } from 'lucide-react';

const INITIAL_ASSETS = [];

const INITIAL_PROJECTION = [];

const INITIAL_MONTHLY = [];

const FIRE_GOAL = 0;
const CATEGORY_COLORS = { '주식':'#3E7CB8', '부동산':'#3E9E8C', '현금성':'#D4AF6A', '기타':'#8C8378', '부채':'#C9645A' };
const NAV_ITEMS = [
  { id:'dashboard', label:'Summary', sub:'전체 현황', icon:LayoutGrid },
  { id:'assets', label:'Assets', sub:'총 자산', icon:PieChartIcon },
  { id:'growth', label:'Growth', sub:'저축 현황', icon:TrendingUp },
  { id:'projection', label:'Future plan', sub:'경제적 자유', icon:Compass },
  { id:'moneyrules', label:'Money Rules', sub:'지출 규칙', icon:BookOpen },
];

function formatEok(v) {
  const sign = v < 0 ? '-' : '', abs = Math.abs(v);
  const eok = Math.floor(abs / 100000000), man = Math.round((abs % 100000000) / 10000);
  if (eok === 0 && man === 0) return '0원';
  if (eok === 0) return `${sign}${man.toLocaleString()}만원`;
  if (man === 0) return `${sign}${eok}억원`;
  return `${sign}${eok}억 ${man.toLocaleString()}만원`;
}
function formatEokShort(v) {
  const sign = v < 0 ? '-' : '';
  const eok = Math.abs(v) / 100000000;
  return `${sign}${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억`;
}
function formatWon(v) { return `${Math.round(v).toLocaleString()}원`; }
function formatManWon(v) {
  const sign = v < 0 ? '-' : '', abs = Math.abs(v);
  const eok = Math.floor(abs / 100000000), man = Math.round((abs % 100000000) / 10000);
  if (eok === 0) return `${sign}${man.toLocaleString()}만`;
  if (man === 0) return `${sign}${eok}억`;
  return `${sign}${eok}억 ${man.toLocaleString()}만`;
}
function formatPercent(v, d = 1) { return `${v > 0 ? '+' : ''}${v.toFixed(d)}%`; }

const CSS = `
  .fire-wrap { font-family: 'Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#0B0E14; color:#EDEAE3; min-height:100vh; display:flex; width:100%; }
  .fire-wrap * { box-sizing:border-box; margin:0; padding:0; }
  .fire-wrap input[type=number]::-webkit-inner-spin-button,
  .fire-wrap input[type=number]::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
  .fire-wrap input[type=number] { -moz-appearance:textfield; }
  .fire-wrap table { border-collapse:collapse; width:100%; }
  .fire-wrap button { font-family:inherit; cursor:pointer; }
  .fire-wrap input, .fire-wrap select { font-family:inherit; }
  .drag-handle { cursor:grab; color:#3A3F4A; transition:color 0.15s; display:flex; align-items:center; }
  .drag-handle:hover { color:#8A8780; }
  .drag-handle:active { cursor:grabbing; }
  .proj-last-row-btn { opacity:0; transition:opacity 0.15s; }
  .proj-last-row:hover .proj-last-row-btn { opacity:1; }
  .recharts-sector:focus, .recharts-pie:focus, svg:focus, .recharts-surface:focus { outline:none !important; }
  @keyframes snack-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes snack-out { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(12px); } }
  .snack-in { animation: snack-in 0.22s ease forwards; }
  .snack-out { animation: snack-out 0.22s ease forwards; }
`;

function SectionCard({ children, style = {} }) {
  return (
    <div style={{ background:'#11151D', border:'1px solid #222834', borderRadius:14, ...style }}>
      {children}
    </div>
  );
}

// 스낵바 훅: { show, message, undoFn } 상태 관리
function useSnackbar() {
  const [snack, setSnack] = useState(null); // { message, undoFn, exiting }
  const timerRef = useRef(null);

  function showSnack(message, undoFn = null) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSnack({ message, undoFn, exiting: false });
    timerRef.current = setTimeout(() => {
      setSnack(s => s ? { ...s, exiting: true } : null);
      setTimeout(() => setSnack(null), 220);
    }, 3500);
  }

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setSnack(s => s ? { ...s, exiting: true } : null);
    setTimeout(() => setSnack(null), 220);
  }

  return { snack, showSnack, dismiss };
}

function Snackbar({ snack, onUndo, onDismiss }) {
  if (!snack) return null;
  return (
    <div style={{ position:'fixed', bottom:28, left:0, right:0, display:'flex', justifyContent:'center', zIndex:500, pointerEvents:'none' }}>
      <div className={snack.exiting ? 'snack-out' : 'snack-in'} style={{
        background: '#1E2433', border: '1px solid #2E3548', borderRadius: 12,
        padding: '12px 18px', display: 'inline-flex', alignItems: 'center', gap: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)', whiteSpace: 'nowrap', pointerEvents:'auto',
      }}>
        <span style={{ fontSize: 15, color: '#EDEAE3' }}>{snack.message}</span>
        {snack.undoFn && (
          <button onClick={() => { snack.undoFn(); onDismiss(); }}
            style={{ background: 'transparent', border: 'none', color: '#4ADE80', fontSize: 15, fontWeight: 700, cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>
            되돌리기
          </button>
        )}
      </div>
    </div>
  );
}

const inputStyle = { width:'100%', background:'#0E1219', border:'1px solid #222834', borderRadius:7, color:'#EDEAE3', fontSize:15.5, padding:'6px 8px', outline:'none', fontVariantNumeric:'tabular-nums' };
const btnGhostStyle = { display:'flex', alignItems:'center', gap:6, background:'transparent', border:'1px solid #222834', color:'#8A8780', fontSize:15.5, fontWeight:500, padding:'7px 12px', borderRadius:8, cursor:'pointer' };
const btnPrimaryStyle = { display:'flex', alignItems:'center', gap:6, background:'#4ADE80', border:'none', color:'#0B2412', fontSize:14, fontWeight:700, padding:'9px 16px', borderRadius:8, cursor:'pointer' };

function MemoNumberCell({ value, memo, onCommit, onMemoSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [hoverMemo, setHoverMemo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const ref = useRef(null);
  const memoRef = useRef(null);
  const hasMemo = !!(memo && memo.length > 0);

  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  useEffect(() => { if (showPopup && memoRef.current) memoRef.current.focus(); }, [showPopup]);

  function commit() {
    const n = Number(draft); setEditing(false);
    if (!isNaN(n) && n !== value) onCommit(n);
  }

  return (
    <td style={{ padding:0, textAlign:'right', position:'relative' }}>
      <input ref={ref} type="text" inputMode="numeric" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') { setEditing(false); setDraft(String(value)); } }}
        style={{ display: editing ? 'block' : 'none', width:'100%', textAlign:'right', fontSize:15.5,
          fontVariantNumeric:'tabular-nums', padding:'8px 0', margin:0, lineHeight:'1.4',
          boxSizing:'border-box', borderRadius:6, border:'none', outline:'none',
          background:'rgba(212,175,106,0.08)', color:'#EDEAE3', fontFamily:'inherit' }}/>
      <div onClick={() => { setDraft(String(value)); setEditing(true); }}
        style={{ display: editing ? 'none' : 'block', width:'70%', marginLeft:'30%', textAlign:'right',
          fontSize:15.5, fontVariantNumeric:'tabular-nums', padding:'8px 0',
          lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, color:'#EDEAE3', cursor:'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,106,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background='transparent'}>
        {value.toLocaleString()}
      </div>
      {/* 메모 버튼 영역 - 항상 absolute로 존재, 자체 hover로 표시 */}
      {!editing && (
        <div
          onMouseEnter={() => setHoverMemo(true)}
          onMouseLeave={() => setHoverMemo(false)}
          onClick={e => { e.stopPropagation(); setMemoDraft(memo||''); setShowPopup(true); }}
          style={{ position:'absolute', right:0, top:0, bottom:0, width:20,
            transform:'translateX(calc(100% + 2px))', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'flex-start', paddingLeft:3,
            color: hasMemo ? '#D4AF6A' : (hoverMemo ? '#D4AF6A' : 'transparent'), zIndex:10 }}>
          <StickyNote size={13} strokeWidth={2}/>
        </div>
      )}
      {hasMemo && hoverMemo && !showPopup && !editing && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:50, pointerEvents:'none',
          background:'#161B25', border:'1px solid #222834', borderRadius:10, padding:'8px 12px',
          boxShadow:'0 8px 24px rgba(0,0,0,0.4)', minWidth:120, maxWidth:240, textAlign:'left' }}>
          <div style={{ color:'#EDEAE3', fontWeight:700, fontSize:15.5, marginBottom:4 }}>
            {value.toLocaleString()}원
          </div>
          <div style={{ color:'#8A8780', fontSize:14, whiteSpace:'pre-wrap' }}>{memo}</div>
        </div>
      )}
      {showPopup && (
        <div onClick={() => setShowPopup(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex',
            alignItems:'center', justifyContent:'center', zIndex:300 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:'#161B25', border:'1px solid #222834', borderRadius:12,
              padding:'20px 22px', width:300, boxShadow:'0 20px 48px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize:14, color:'#8A8780', marginBottom:8 }}>세부 메모</div>
            <textarea ref={memoRef} value={memoDraft} onChange={e => setMemoDraft(e.target.value)}
              rows={4} placeholder="내용을 입력하세요..."
              style={{ width:'100%', background:'#0E1219', border:'1px solid #222834', borderRadius:8,
                color:'#EDEAE3', fontSize:14, padding:'8px 10px', outline:'none', fontFamily:'inherit',
                resize:'none', boxSizing:'border-box' }}/>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12 }}>
              {hasMemo && (
                <button onClick={() => { onMemoSave(''); setShowPopup(false); }}
                  style={{ background:'transparent', border:'none', color:'#D98273', fontSize:13,
                    cursor:'pointer', fontFamily:'inherit' }}>삭제</button>
              )}
              <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
                <button onClick={() => setShowPopup(false)}
                  style={{ background:'transparent', border:'1px solid #222834', color:'#8A8780',
                    fontSize:13, padding:'6px 12px', borderRadius:7, cursor:'pointer', fontFamily:'inherit' }}>취소</button>
                <button onClick={() => { onMemoSave(memoDraft.trim()); setShowPopup(false); }}
                  style={{ background:'#4ADE80', border:'none', color:'#0B2412', fontSize:13,
                    fontWeight:700, padding:'6px 14px', borderRadius:7, cursor:'pointer', fontFamily:'inherit' }}>저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}

function EditableNumberCell({ value, onCommit, color, align = 'right', formatter }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  function commit() { const n = Number(draft); setEditing(false); if (!isNaN(n) && n !== value) onCommit(n); }
  return (
    <td style={{ padding:0, textAlign:align }}>
      <input ref={ref} type="text" inputMode="numeric" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(String(value)); } }}
        style={{ display: editing ? 'block' : 'none', width:'100%', textAlign:align, fontSize:15.5, fontVariantNumeric:'tabular-nums', padding:'8px 0', margin:0, lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, border:'none', outline:'none', background:'rgba(212,175,106,0.08)', color:color||'#EDEAE3', fontFamily:'inherit' }} />
      <div onClick={() => { setDraft(String(value)); setEditing(true); }}
        style={{ display: editing ? 'none' : 'block', width:'70%', marginLeft:'30%', textAlign:align, fontSize:15.5, fontVariantNumeric:'tabular-nums', padding:'8px 0', lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, color:color||'#EDEAE3', cursor:'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,106,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {formatter ? formatter(value) : value.toLocaleString()}
      </div>
    </td>
  );
}

function EditableTextCell({ value, onCommit, weight = 500, color }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);
  function commit() { setEditing(false); const t = draft.trim(); if (t && t !== value) onCommit(t); }
  return (
    <td style={{ padding:0 }}>
      <input ref={ref} type="text" value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
        style={{ display: editing ? 'block' : 'none', width:'100%', fontSize:15.5, padding:'8px 0', margin:0, lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, border:'none', outline:'none', background:'rgba(212,175,106,0.08)', color:color||'#EDEAE3', fontFamily:'inherit', fontWeight:weight }} />
      <div onClick={() => { setDraft(value); setEditing(true); }}
        style={{ display: editing ? 'none' : 'block', width:'70%', fontSize:15.5, padding:'8px 0', lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, color:color||'#EDEAE3', fontWeight:weight, cursor:'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,106,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {value}
      </div>
    </td>
  );
}

function EditableSelectCell({ value, options, onCommit, renderDisplay }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  return (
    <td style={{ padding:0 }}>
      <select ref={ref} value={value}
        onChange={e => { onCommit(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={{ display: editing ? 'block' : 'none', width:'100%', fontSize:15.5, padding:'8px 0', margin:0, lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, border:'none', outline:'none', background:'#0E1219', color:'#EDEAE3', fontFamily:'inherit' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <div onClick={() => setEditing(true)}
        style={{ display: editing ? 'none' : 'block', width:'70%', fontSize:15.5, padding:'8px 0', lineHeight:'1.4', boxSizing:'border-box', borderRadius:6, cursor:'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(212,175,106,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {renderDisplay ? renderDisplay(value) : value}
      </div>
    </td>
  );
}

function YearDropdown({ years, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(255,255,255,0.06)', border:'1px solid #222834', color:'#EDEAE3', fontSize:15.5, fontWeight:700, padding:'6px 10px', borderRadius:7, cursor:'pointer' }}>
        {selected}년 <span style={{ fontSize:10, transform:open ? 'rotate(180deg)' : 'none', display:'inline-block', transition:'transform 0.15s' }}>▼</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:20, background:'#161B25', border:'1px solid #222834', borderRadius:9, boxShadow:'0 10px 28px rgba(0,0,0,0.4)', overflow:'hidden', minWidth:88 }}>
          {years.map(y => (
            <button key={y} onClick={() => { onSelect(y); setOpen(false); }} style={{ display:'block', width:'100%', textAlign:'left', background:y === selected ? 'rgba(255,255,255,0.08)' : 'transparent', border:'none', color:'#EDEAE3', fontSize:15.5, fontWeight:y === selected ? 700 : 500, padding:'8px 12px', cursor:'pointer' }}>
              {y}년
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableNoteRow({ year, note, onCommit, onDelete, isLast }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note || '');
  const [hover, setHover] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  function commit() {
    setEditing(false); setHover(false);
    const t = draft.trim();
    if (t !== (note || '')) onCommit(t);
  }
  function cancel() { setEditing(false); setHover(false); setDraft(note || ''); }

  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:14 }}>
      <span style={{ color:'#5C594F', minWidth:36, flexShrink:0 }}>{year}</span>
      {editing ? (
        <input ref={ref} type="text" value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') cancel(); }}
          style={{ ...inputStyle, fontSize:14, padding:'4px 8px', flex:1 }} />
      ) : (
        <div onClick={() => { setDraft(note||''); setEditing(true); }}
          style={{ flex:1, cursor:'pointer', borderRadius:5, padding:'4px 6px', marginLeft:-6,
            color: note ? '#8A8780' : '#5C594F',
            background: hover ? 'rgba(212,175,106,0.08)' : 'transparent',
            transition:'background 0.12s',
            lineHeight: '1.5', wordBreak:'break-word', whiteSpace:'pre-wrap',
          }}>
          {note || ' '}
        </div>
      )}
      {isLast && onDelete && (
        <button onClick={onDelete}
          style={{ background:'transparent', border:'none', color: hover ? '#D98273' : 'transparent', padding:4, borderRadius:6, cursor:'pointer', display:'inline-flex', alignItems:'center', transition:'color 0.15s', flexShrink:0 }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function ConfirmDeleteModal({ open, itemName, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div onClick={onCancel} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:'#161B25', border:'1px solid #222834', borderRadius:14, padding:'24px 26px', width:320, boxShadow:'0 20px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:18 }}>
          <Trash2 size={18} color="#D98273" style={{ marginTop:1, flexShrink:0 }} />
          <div>
            <div style={{ fontSize:15.5, fontWeight:700, color:'#EDEAE3', marginBottom:4 }}>항목을 삭제할까요?</div>
            <div style={{ fontSize:15.5, color:'#8A8780', lineHeight:1.5 }}>
              {itemName ? <><b style={{ color:'#EDEAE3' }}>"{itemName}"</b>을(를)</> : '이 항목을'} 삭제하면 되돌릴 수 없어요.
            </div>
          </div>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={btnGhostStyle}>취소</button>
          <button onClick={onConfirm} style={{ ...btnPrimaryStyle, background:'#D98273', color:'#2A1410' }}>
            <Trash2 size={13} /> 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 드래그 앤 드롭 자산 테이블 ──
function DraggableAssetsTable({ assets, setAssets, showSnack }) {
  const [hoverRow, setHoverRow] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const dragId = useRef(null);

  function updateField(id, field, value) { setAssets(assets.map(a => a.id === id ? { ...a, [field]: value } : a)); }
  function addRow() {
    const newRow = { id:`a${Date.now()}`, name:'새 항목', owner:'공동', category:'기타', principal:0, current:0 };
    setAssets([...assets, newRow]);
    showSnack('항목이 추가됐어요.');
  }
  function confirmDelete() {
    const snapshot = [...assets];
    const name = deleteTarget.name;
    setAssets(assets.filter(a => a.id !== deleteTarget.id));
    setDeleteTarget(null);
    showSnack(`"${name}" 항목을 삭제했어요.`, () => setAssets(snapshot));
  }

  function onDragStart(e, id) { dragId.current = id; e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (id !== dragId.current) setDragOverId(id); }
  function onDrop(e, targetId) {
    e.preventDefault();
    if (!dragId.current || dragId.current === targetId) { setDragOverId(null); return; }
    const from = assets.findIndex(a => a.id === dragId.current);
    const to = assets.findIndex(a => a.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...assets];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setAssets(next);
    dragId.current = null;
    setDragOverId(null);
  }
  function onDragEnd() { dragId.current = null; setDragOverId(null); }

  return (
    <div style={{ overflowX:'auto', margin:'0 -24px', padding:'0 24px' }}>
      <table style={{ fontSize:15.5, width:'100%', tableLayout:'fixed' }}>
        <thead>
          <tr style={{ color:'#8A8780', fontSize:14 }}>
            <th style={{ width:0, padding:0 }}></th>
            <th style={{ textAlign:'left', fontWeight:500, paddingBottom:10, width:'14%' }}>분류</th>
            <th style={{ textAlign:'left', fontWeight:500, paddingBottom:10 }}>항목</th>
            <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10, width:'15%' }}>원금</th>
            <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10, width:'15%' }}>현재가</th>
            <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10, width:'10%' }}>수익률</th>
            <th style={{ width:0, padding:0 }}></th>
          </tr>
        </thead>
        <tbody>
          {assets.map(a => {
            const rate = a.principal !== 0 ? ((a.current - a.principal) / Math.abs(a.principal)) * 100 : 0;
            const isDraggingThis = dragId.current === a.id;
            const isDragOver = dragOverId === a.id;
            return (
              <tr key={a.id}
                draggable
                onDragStart={e => onDragStart(e, a.id)}
                onDragOver={e => onDragOver(e, a.id)}
                onDrop={e => onDrop(e, a.id)}
                onDragEnd={onDragEnd}
                onMouseEnter={() => setHoverRow(a.id)}
                onMouseLeave={() => setHoverRow(null)}
                style={{
                  borderTop: isDragOver ? '2px solid #D4AF6A' : '1px solid #1A2029',
                  opacity: isDraggingThis ? 0.3 : 1,
                  transition: 'opacity 0.15s',
                  background: isDragOver ? 'rgba(212,175,106,0.05)' : 'transparent',
                }}>
                <td style={{ width:0, padding:0, position:'relative' }}>
                  <div className="drag-handle"
                    style={{ position:'absolute', right:4, top:'50%', transform:'translateY(-50%)',
                      display:'flex', flexDirection:'column', gap:3, padding:'2px 4px',
                      opacity: hoverRow === a.id ? 1 : 0, transition:'opacity 0.15s' }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ display:'flex', gap:3 }}>
                        <span style={{ width:3, height:3, borderRadius:'50%', background:'currentColor', display:'inline-block' }}/>
                        <span style={{ width:3, height:3, borderRadius:'50%', background:'currentColor', display:'inline-block' }}/>
                      </div>
                    ))}
                  </div>
                </td>
                <EditableSelectCell value={a.category} options={Object.keys(CATEGORY_COLORS)} onCommit={v => updateField(a.id, 'category', v)}
                  renderDisplay={v => <span style={{ fontSize:15.5, padding:'2px 8px', borderRadius:20, background:`${CATEGORY_COLORS[v]}22`, color:CATEGORY_COLORS[v] }}>{v}</span>} />
                <EditableTextCell value={a.name} onCommit={v => updateField(a.id, 'name', v)} />
                <EditableNumberCell value={a.principal} color="#8A8780" onCommit={v => updateField(a.id, 'principal', v)} />
                <EditableNumberCell value={a.current} color="#EDEAE3" onCommit={v => updateField(a.id, 'current', v)} />
                <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:rate > 0 ? '#4ADE80' : rate < 0 ? '#D98273' : '#8A8780' }}>
                  {a.principal === 0 ? '-' : formatPercent(rate, 2)}
                </td>
                <td style={{ width:0, padding:0, position:'relative' }}>
                  <div style={{ position:'absolute', left:'100%', top:'50%', transform:'translateY(-50%)',
                    opacity: hoverRow === a.id ? 1 : 0, transition:'opacity 0.15s' }}>
                    <button onClick={() => setDeleteTarget(a)}
                      style={{ background:'transparent', border:'none', color:'#D98273', padding:5, borderRadius:6, cursor:'pointer', display:'inline-flex', alignItems:'center' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display:'flex', justifyContent:'center', marginTop:18 }}>
        <button onClick={addRow} style={{ ...btnGhostStyle }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#EDEAE3'; }}
          onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8A8780'; }}
        >+ 항목 추가</button>
      </div>
      <ConfirmDeleteModal
        open={!!deleteTarget}
        itemName={deleteTarget?.name}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function PieChartWithTooltip({ categoryData, assets, totals }) {
  const [tooltip, setTooltip] = useState(null); // { name, value, x, y }
  const containerRef = useRef(null);

  function handleMouseMove(e) {
    // recharts onMouseMove on Pie gives activeIndex
  }

  return (
    <div ref={containerRef} style={{ width:190, height:190, position:'relative', flexShrink:0 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={categoryData} dataKey="value" nameKey="name"
            innerRadius={64} outerRadius={92} paddingAngle={2} stroke="none"
            onMouseEnter={(data, index, e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              setTooltip({ name: data.name, value: data.value, index });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {categoryData.map((e, i) => (
              <Cell key={e.name}
                fill={CATEGORY_COLORS[e.name]||'#888'}
                opacity={tooltip && tooltip.index !== i ? 0.55 : 1}
                style={{ transition:'opacity 0.15s', outline:'none' }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* 중앙 텍스트 */}
      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', textAlign:'center', pointerEvents:'none' }}>
        {tooltip ? (
          <>
            <div style={{ fontSize:15.5, color:'#8A8780' }}>{tooltip.name}</div>
            <div style={{ fontSize:20, fontWeight:700, color: CATEGORY_COLORS[tooltip.name]||'#EDEAE3' }}>{formatEokShort(tooltip.value)}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize:15.5, color:'#8A8780' }}>총 자산</div>
            <div style={{ fontSize:20, fontWeight:700 }}>{formatEokShort(totals.current)}</div>
          </>
        )}
      </div>

      {/* 커스텀 툴팁 박스 — 차트 오른쪽에 고정 */}
      {tooltip && (() => {
        const items = assets.filter(a => a.category === tooltip.name && a.current > 0);
        return (
          <div style={{
            position:'absolute', top:0, left:'calc(100% + 12px)',
            background:'#161B25', border:'1px solid #222834', borderRadius:10,
            padding:'12px 14px', fontSize:14, whiteSpace:'nowrap',
            boxShadow:'0 8px 24px rgba(0,0,0,0.4)', zIndex:50, pointerEvents:'none',
          }}>
            <div style={{ color:'#EDEAE3', fontWeight:700, marginBottom:6 }}>{tooltip.name}</div>
            <div style={{ color:'#8A8780', marginBottom:3 }}>
              총 금액: <span style={{ color:'#EDEAE3', fontWeight:600 }}>{formatWon(tooltip.value)}</span>
            </div>
            {items.map(a => (
              <div key={a.id} style={{ color:'#8A8780' }}>
                {a.name}: <span style={{ color:'#EDEAE3', fontWeight:600 }}>{formatWon(a.current)}</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

function SummaryConfigModal({ dashSummary, setDashSummary, cols, onClose }) {
  const [items, setItems] = useState(dashSummary.map(i => ({ ...i, keys: [...i.keys] })));

  function addItem() {
    setItems(prev => [...prev, { id:'s'+Date.now(), label:'새 항목', keys:[] }]);
  }
  function removeItem(id) {
    setItems(prev => prev.filter(i => i.id !== id));
  }
  function updateLabel(id, label) {
    setItems(prev => prev.map(i => i.id===id ? {...i, label} : i));
  }
  function toggleKey(id, key) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const keys = i.keys.includes(key) ? i.keys.filter(k=>k!==key) : [...i.keys, key];
      return { ...i, keys };
    }));
  }
  function save() {
    setDashSummary(items.filter(i => i.label.trim()));
    onClose();
  }

  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#161B25', border:'1px solid #222834', borderRadius:14, padding:'24px 26px', width:480, maxHeight:'80vh', overflowY:'auto', boxShadow:'0 20px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize:15, fontWeight:700, color:'#EDEAE3', marginBottom:18 }}>이번 달 요약 항목 설정</div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {items.map((item, idx) => (
            <div key={item.id} style={{ background:'#0E1219', borderRadius:10, padding:'14px 16px', border:'1px solid #222834' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <input type="text" value={item.label}
                  onChange={e => updateLabel(item.id, e.target.value)}
                  style={{ flex:1, background:'#11151D', border:'1px solid #222834', borderRadius:7, color:'#EDEAE3', fontSize:14, padding:'6px 10px', outline:'none', fontFamily:'inherit' }}
                  placeholder="항목명"
                />
                <button onClick={() => removeItem(item.id)}
                  style={{ background:'transparent', border:'none', color:'#D98273', cursor:'pointer', display:'inline-flex', padding:4 }}>
                  <Trash2 size={14}/>
                </button>
              </div>
              <div style={{ fontSize:13, color:'#5C594F', marginBottom:6 }}>연결할 컬럼 선택</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {cols.map(c => {
                  const active = item.keys.includes(c.key);
                  return (
                    <button key={c.key} onClick={() => toggleKey(item.id, c.key)}
                      style={{ fontSize:13, padding:'3px 10px', borderRadius:20, cursor:'pointer', fontFamily:'inherit',
                        background: active ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                        border: active ? '1px solid rgba(74,222,128,0.4)' : '1px solid #222834',
                        color: active ? '#4ADE80' : '#8A8780' }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div onClick={addItem}
          style={{ display:'flex', alignItems:'center', gap:6, marginTop:12, padding:'6px 4px', color:'#5C594F', fontSize:14, cursor:'pointer', borderRadius:6, width:'fit-content' }}
          onMouseEnter={e => { e.currentTarget.style.color='#8A8780'; e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.color='#5C594F'; e.currentTarget.style.background='transparent'; }}>
          <Plus size={14}/> 항목 추가
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
          <button onClick={onClose} style={{ ...{display:'flex',alignItems:'center',gap:6,background:'transparent',border:'1px solid #222834',color:'#8A8780',fontSize:14,fontWeight:500,padding:'7px 14px',borderRadius:8,cursor:'pointer',fontFamily:'inherit'} }}>취소</button>
          <button onClick={save} style={{ ...{display:'flex',alignItems:'center',gap:6,background:'#4ADE80',border:'none',color:'#0B2412',fontSize:14,fontWeight:700,padding:'7px 16px',borderRadius:8,cursor:'pointer',fontFamily:'inherit'} }}>저장</button>
        </div>
      </div>
    </div>
  );
}

function EditableGoal({ goal, setGoal }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(goal));
  const [hover, setHover] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  function commit() {
    setEditing(false); setHover(false);
    const n = Number(draft);
    if (!isNaN(n) && n > 0 && n !== goal) setGoal(n);
  }

  if (editing) return (
    <input ref={ref} type="text" inputMode="numeric" value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') { setEditing(false); setDraft(String(goal)); } }}
      style={{ ...inputStyle, fontSize:18, fontWeight:700, color:'#4ADE80', textAlign:'right', width:160, padding:'2px 6px' }}
    />
  );

  return (
    <div onClick={() => { setDraft(String(goal)); setEditing(true); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ fontSize:20, fontWeight:700, color:'#4ADE80', lineHeight:1, cursor:'pointer',
        borderRadius:6, padding:'3px 6px', marginRight:-6,
        background: hover ? 'rgba(212,175,106,0.08)' : 'transparent',
        transition:'background 0.12s',
      }}>
      {formatEok(goal)}
    </div>
  );
}

function DashboardPage({ assets, monthly, projection, goal, setGoal, cols, dashSummary, setDashSummary }) {
  const [showSummaryConfig, setShowSummaryConfig] = useState(false);
  const totals = useMemo(() => {
    const p = assets.reduce((s,a) => s+a.principal, 0), c = assets.reduce((s,a) => s+a.current, 0);
    return { principal:p, current:c, gain:c-p };
  }, [assets]);

  const monthlyTotals = useMemo(() => monthly.map(m => {
    const yi=Number(m.yongwookIncome)||0, hi=Number(m.hannaIncome)||0, ex=Number(m.expense)||0, sg=Number(m.stockGain)||0, et=Number(m.etc)||0;
    return { ...m, yongwookIncome:yi, hannaIncome:hi, expense:ex, stockGain:sg, etc:et, total:yi+hi+ex+sg+et };
  }), [monthly]);

  const lastMonth = useMemo(() => {
    const valid = monthlyTotals.filter(m => m.month && (m.yongwookIncome||m.hannaIncome||m.expense||m.stockGain||m.etc));
    if (!valid.length) return { total:0, yongwookIncome:0, hannaIncome:0, stockGain:0, expense:0, etc:0, label:'-', month:'' };
    return valid.reduce((l,m) => m.month > l.month ? m : l, valid[0]);
  }, [monthlyTotals]);

  const yearMonthlyTotals = useMemo(() => Array.from({ length:12 }, (_,i) => {
    const mn = i+1, mk = `2026-${String(mn).padStart(2,'0')}`;
    const ex = monthly.find(m => m.month === mk);
    if (ex) return { ...ex, total:ex.yongwookIncome+ex.hannaIncome+ex.expense+ex.stockGain+ex.etc };
    return { id:mk, month:mk, label:`${mn}월`, yongwookIncome:0, hannaIncome:0, expense:0, stockGain:0, etc:0, total:0 };
  }), [monthly]);

  const progressPct = Math.min(100, (totals.current / goal) * 100);
  const remaining = goal - totals.current;

  const chartData = useMemo(() => projection.map(p => ({
    year: String(p.year),
    '목표': p.deposit+p.union+p.stock+p.loan,
    '실제': p.year === 2026 ? totals.current : p.year < 2026 ? p.deposit+p.union+p.stock+p.loan : null,
  })), [projection, totals.current]);

  const STEP = 500000000;
  const yAxisTicks = useMemo(() => {
    const maxV = Math.max(...chartData.map(d => Math.max(d['목표']||0, d['실제']||0)), goal, STEP);
    const top = Math.ceil(maxV / STEP) * STEP;
    const t = []; for (let v=0; v<=top; v+=STEP) t.push(v); return t;
  }, [chartData, goal]);

  const categoryData = useMemo(() => {
    const map = {};
    assets.forEach(a => { if (a.current > 0) map[a.category] = (map[a.category]||0) + a.current; });
    const sum = Object.values(map).reduce((s,v) => s+v, 0);
    return Object.entries(map).map(([name,value]) => ({ name, value, pct:sum?(value/sum)*100:0 })).sort((a,b) => b.value-a.value);
  }, [assets]);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      {/* KPI */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18 }}>
        <SectionCard style={{ padding:'24px 28px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>순자산</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#4ADE80', fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{formatEok(totals.current)}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
              <div style={{ fontSize:14, color:'#8A8780', marginBottom:6 }}>목표</div>
              <EditableGoal goal={goal} setGoal={setGoal} />
            </div>
          </div>
          <div style={{ marginTop:18 }}>
            <div style={{ height:9, background:'#1C212B', borderRadius:6, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${progressPct}%`, background:'#4ADE80', borderRadius:6, transition:'width 0.6s ease' }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:15.5, color:'#8A8780' }}>
              <span>달성률 <b style={{ color:'#4ADE80' }}>{progressPct.toFixed(1)}%</b></span>
              <span>목표까지 {formatEok(remaining)}</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard style={{ padding:'24px 28px', display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <div style={{ fontSize:16, fontWeight:700 }}>이번 달 순자산 증가</div>
              <button onClick={() => setShowSummaryConfig(true)}
                style={{ background:'transparent', border:'none', color:'#5C594F', cursor:'pointer', display:'inline-flex', alignItems:'center', padding:4, borderRadius:6 }}
                onMouseEnter={e => e.currentTarget.style.color='#8A8780'}
                onMouseLeave={e => e.currentTarget.style.color='#5C594F'}>
                <Settings size={14}/>
              </button>
            </div>
            <div style={{ fontSize:26, fontWeight:700, color:lastMonth.total>=0?'#4ADE80':'#D98273', fontVariantNumeric:'tabular-nums' }}>
              {lastMonth.total >= 0 ? '+' : '-'}{formatEok(Math.abs(lastMonth.total))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${dashSummary.length},1fr)`, columnGap:12, marginTop:18 }}>
            {dashSummary.map(item => {
              const value = item.keys.reduce((s, k) => s + (Number(lastMonth[k]) || 0), 0);
              return (
                <div key={item.id}>
                  <div style={{ fontSize:14, color:'#8A8780', marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:15.5, fontWeight:600, color:value>=0?'#4ADE80':'#D98273', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                    {value >= 0 ? '+' : ''}{formatManWon(value)}
                  </div>
                </div>
              );
            })}
          </div>
          {showSummaryConfig && (
            <SummaryConfigModal
              dashSummary={dashSummary}
              setDashSummary={setDashSummary}
              cols={cols}
              onClose={() => setShowSummaryConfig(false)}
            />
          )}
        </SectionCard>
      </div>

      {/* 차트 */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18 }}>
        <SectionCard style={{ padding:'24px 28px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>순자산 성장 추이</h3>
            <div style={{ display:'flex', gap:14, fontSize:14, color:'#8A8780' }}>
              <span><span style={{ display:'inline-block', width:14, height:2, background:'#4ADE80', marginRight:5, verticalAlign:'middle' }}/>실제</span>
              <span><span style={{ display:'inline-block', width:14, height:0, borderTop:'2px dashed #8A8780', marginRight:5, verticalAlign:'middle' }}/>목표</span>
            </div>
          </div>
          <div style={{ width:'100%', height:260, marginTop:8 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top:10, right:10, left:-6, bottom:0 }}>
                <defs>
                  <linearGradient id="af" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="#4ADE80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1A2029" vertical={false}/>
                <XAxis dataKey="year" tick={{ fill:'#8A8780', fontSize:14 }} axisLine={{ stroke:'#222834' }} tickLine={false}/>
                <YAxis ticks={yAxisTicks} domain={[0, yAxisTicks[yAxisTicks.length-1]]}
                  tickFormatter={v => v>0&&v%1000000000===0?`${Math.round(v/100000000)}억`:''}
                  tick={{ fill:'#8A8780', fontSize:14 }} axisLine={false} tickLine={false} width={42}/>
                <Tooltip contentStyle={{ background:'#161B25', border:'1px solid #222834', borderRadius:10, fontSize:15.5 }}
                  labelStyle={{ color:'#EDEAE3', fontWeight:700, marginBottom:4 }}
                  formatter={(v,n) => v==null?['-',n]:[formatEok(v),n]}/>
                <ReferenceLine y={goal} stroke="#4ADE80" strokeDasharray="4 4"
                  label={{ value:`목표 ${formatEokShort(goal)}`, position:'insideTopRight', fill:'#4ADE80', fontSize:13 }}/>
                <Line type="monotone" dataKey="목표" stroke="#9A9183" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r:2.5, fill:'#9A9183' }}/>
                <Area type="monotone" dataKey="실제" stroke="#4ADE80" strokeWidth={2.5} fill="url(#af)" dot={{ r:3, fill:'#4ADE80' }} connectNulls={false}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard style={{ padding:'24px 28px' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:10 }}>자산 구성</h3>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:28 }}>
            <PieChartWithTooltip categoryData={categoryData} assets={assets} totals={totals} />
            <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', columnGap:20, rowGap:8 }}>
              {categoryData.map(c => (
                <div key={c.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:14 }}>
                  <span style={{ width:9, height:9, borderRadius:'50%', background:CATEGORY_COLORS[c.name]||'#888', flexShrink:0 }}/>
                  <span style={{ color:'#8A8780' }}>{c.name}</span>
                  <span style={{ color:'#EDEAE3', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{c.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* 하단 테이블 */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:18 }}>
        <SectionCard style={{ padding:'24px 28px' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:14 }}>올해 저축 현황</h3>
          <div style={{ overflowX:'auto' }}>
            <table style={{ fontSize:15.5, width:'100%', tableLayout:'fixed' }}>
              <thead>
                <tr style={{ color:'#8A8780', textAlign:'right', fontSize:14 }}>
                  <th style={{ textAlign:'left', fontWeight:500, paddingBottom:8, width:'8%' }}>월</th>
                  {cols.map(c => <th key={c.key} style={{ fontWeight:500, paddingBottom:8 }}>{c.label}</th>)}
                  <th style={{ fontWeight:500, paddingBottom:8 }}>합계</th>
                </tr>
              </thead>
              <tbody>
                {yearMonthlyTotals.map(m => {
                  const total = cols.reduce((s,c) => s+(Number(m[c.key])||0), 0);
                  return (
                    <tr key={m.id} style={{ borderTop:'1px solid #1A2029' }}>
                      <td style={{ textAlign:'left', padding:'8px 0', fontWeight:600 }}>{m.label}</td>
                      {cols.map(c => <td key={c.key} style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{(Number(m[c.key])||0).toLocaleString()}</td>)}
                      <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color:total>=0?'#4ADE80':'#D98273' }}>{total.toLocaleString()}</td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop:'2px solid #222834' }}>
                  <td style={{ textAlign:'left', padding:'10px 0', fontWeight:700 }}>합계</td>
                  {cols.map(c => <td key={c.key} style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{yearMonthlyTotals.reduce((s,m)=>s+(Number(m[c.key])||0),0).toLocaleString()}</td>)}
                  {(()=>{ const t=yearMonthlyTotals.reduce((s,m)=>s+cols.reduce((ss,c)=>ss+(Number(m[c.key])||0),0),0); return <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color:t>=0?'#4ADE80':'#D98273' }}>{t.toLocaleString()}</td>; })()}
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard style={{ padding:'24px 28px' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:14 }}>총 자산 현황</h3>
          <div style={{ overflowX:'auto' }}>
            <table style={{ fontSize:15.5 }}>
              <thead>
                <tr style={{ color:'#8A8780', fontSize:14 }}>
                  <th style={{ textAlign:'left', fontWeight:500, paddingBottom:8 }}>항목</th>
                  <th style={{ textAlign:'right', fontWeight:500, paddingBottom:8 }}>현재가</th>
                  <th style={{ textAlign:'right', fontWeight:500, paddingBottom:8 }}>수익률</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(a => {
                  const rate = a.principal !== 0 ? ((a.current-a.principal)/Math.abs(a.principal))*100 : 0;
                  return (
                    <tr key={a.id} style={{ borderTop:'1px solid #1A2029' }}>
                      <td style={{ textAlign:'left', padding:'8px 0' }}>{a.name}</td>
                      <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums' }}>{a.current.toLocaleString()}</td>
                      <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:rate>0?'#4ADE80':rate<0?'#D98273':'#8A8780' }}>
                        {a.principal===0?'-':formatPercent(rate,2)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ borderTop:'2px solid #222834' }}>
                  <td style={{ textAlign:'left', padding:'10px 0', fontWeight:700 }}>총 자산</td>
                  <td style={{ textAlign:'right', color:'#4ADE80', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{totals.current.toLocaleString()}</td>
                  <td style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', color:totals.gain>0?'#4ADE80':totals.gain<0?'#D98273':'#8A8780', fontWeight:700 }}>
                    {totals.principal===0?'-':formatPercent((totals.gain/Math.abs(totals.principal))*100,2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function AssetsPage({ assets, setAssets, showSnack }) {
  const totals = useMemo(() => ({ principal:assets.reduce((s,a)=>s+a.principal,0), current:assets.reduce((s,a)=>s+a.current,0) }), [assets]);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <SectionCard style={{ padding:'24px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div><div style={{ fontSize:14, color:'#8A8780' }}>원금 합계</div><div style={{ fontSize:22, fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{formatWon(totals.principal)}</div></div>
          <span style={{ color:'#8A8780' }}>→</span>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:14, color:'#8A8780' }}>현재가 합계</div><div style={{ fontSize:22, fontWeight:700, color:'#4ADE80', fontVariantNumeric:'tabular-nums' }}>{formatWon(totals.current)}</div></div>
        </div>
      </SectionCard>
      <SectionCard style={{ padding:'24px 28px' }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:16 }}>총 재산 항목</h3>
        <DraggableAssetsTable assets={assets} setAssets={setAssets} showSnack={showSnack} />
      </SectionCard>
    </div>
  );
}

// 컬럼 헤더 컴포넌트 - 별도 분리로 JSX 파서 오류 방지
function ColMenuHeader({ col, isLast, activeMenu, onToggleMenu, onDelete, onAdd, onRename, colWidth }) {
  const menuRef = useRef(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(col.label);
  const inputRef = useRef(null);

  useEffect(() => {
    if (activeMenu && menuRef.current) menuRef.current.focus();
  }, [activeMenu]);

  useEffect(() => {
    if (renaming && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [renaming]);

  function commitRename() {
    const t = draft.trim();
    if (t && t !== col.label) onRename(t);
    setRenaming(false);
  }

  return (
    <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10, position:'relative', width: colWidth || undefined }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:6 }}>
        {renaming ? (
          <input ref={inputRef} type="text" value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key==='Enter') commitRename(); if (e.key==='Escape') { setRenaming(false); setDraft(col.label); } }}
            style={{ ...{width:'100%', background:'#0E1219', border:'1px solid #222834', borderRadius:6, color:'#EDEAE3', fontSize:14, padding:'2px 6px', outline:'none', fontFamily:'inherit', textAlign:'right'} }}
          />
        ) : (
          <div
            onClick={onToggleMenu}
            style={{ cursor:'pointer', borderRadius:6, padding:'2px 6px', userSelect:'none',
              background: activeMenu ? 'rgba(212,175,106,0.08)' : 'transparent' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(212,175,106,0.08)'}
            onMouseLeave={e => { if (!activeMenu) e.currentTarget.style.background='transparent'; }}>
            {col.label}
          </div>
        )}
      </div>
      {activeMenu && !renaming && (
        <div
          ref={menuRef}
          tabIndex={-1}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) onToggleMenu(e); }}
          style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:30,
            background:'#161B25', border:'1px solid #222834', borderRadius:10,
            boxShadow:'0 8px 24px rgba(0,0,0,0.4)', padding:'6px', minWidth:130, outline:'none' }}>
          <button
            onClick={() => { setRenaming(true); setDraft(col.label); onToggleMenu(); }}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'transparent', border:'none',
              color:'#EDEAE3', fontSize:14, padding:'7px 10px', borderRadius:7, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Edit3 size={14}/> 이름 변경
          </button>
          <button
            onClick={() => { onDelete(); }}
            style={{ display:'flex', alignItems:'center', gap:8, width:'100%', background:'transparent', border:'none',
              color:'#D98273', fontSize:14, padding:'7px 10px', borderRadius:7, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(217,130,115,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <Trash2 size={14}/> 컬럼 삭제
          </button>
        </div>
      )}
    </th>
  );
}

function GrowthPage({ monthly, setMonthly, showSnack, cols, setCols, memos, setMemos }) {
  const [selectedYear, setSelectedYear] = useState('2026');
  const [activeMenu, setActiveMenu] = useState(null);
  const [colToDelete, setColToDelete] = useState(null);
  const menuRef = useRef(null);


  function addCol() {
    const newKey = 'col_' + Date.now();
    setCols(prev => [...prev, { key: newKey, label: '새 항목' }]);
  }

  function confirmDeleteCol() {
    const snap = [...cols];
    const label = colToDelete.label;
    setCols(prev => prev.filter(c => c.key !== colToDelete.key));
    setColToDelete(null);
    showSnack(`"${label}" 컬럼을 삭제했어요.`, () => setCols(snap));
  }

  const dataYears = useMemo(() => {
    const ys = Array.from(new Set(monthly.map(m => m.month.split('-')[0])));
    return Array.from(new Set(['2023','2024','2025','2026',...ys])).sort();
  }, [monthly]);

  const monthsOfYear = useMemo(() => Array.from({ length:12 }, (_,i) => {
    const mn = i+1, mk = selectedYear + '-' + String(mn).padStart(2,'0');
    const ex = monthly.find(m => m.month === mk);
    const base = ex || { id:null, month:mk, label:`${mn}월`, yongwookIncome:0, hannaIncome:0, expense:0, stockGain:0, etc:0 };
    const total = cols.reduce((s, c) => s + (Number(base[c.key]) || 0), 0);
    return { ...base, total };
  }), [monthly, selectedYear, cols]);

  function updateField(row, field, value) {
    if (row.id) { setMonthly(monthly.map(m => m.id===row.id ? { ...m, [field]:value } : m)); }
    else { setMonthly([...monthly, { id:'m'+Date.now(), month:row.month, label:row.label, yongwookIncome:0, hannaIncome:0, expense:0, stockGain:0, etc:0, [field]:value }]); }
  }

  const chartData = monthsOfYear.map(r => ({ label:r.label, total:r.total }));
  const maxVal = Math.max(...chartData.map(d => Math.abs(d.total)), 1);
  const maxLabel = Math.round(maxVal/10000).toLocaleString() + '만';
  const yAxisWidth = maxLabel.length * 9 + 4;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <SectionCard style={{ padding:'24px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>월별 순자산 증감</h3>
          <YearDropdown years={dataYears} selected={selectedYear} onSelect={setSelectedYear}/>
        </div>
        <div style={{ width:'100%', height:220 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top:10, right:10, left:0, bottom:0 }}>
              <CartesianGrid stroke="#1A2029" vertical={false}/>
              <XAxis dataKey="label" tick={{ fill:'#8A8780', fontSize:14 }} axisLine={{ stroke:'#222834' }} tickLine={false}/>
              <YAxis tickFormatter={v => (v<0?'-':'') + Math.round(Math.abs(v)/10000).toLocaleString() + '만'} tick={{ fill:'#8A8780', fontSize:14 }} axisLine={false} tickLine={false} width={yAxisWidth}/>
              <ReferenceLine y={0} stroke="#222834"/>
              <Tooltip
                cursor={{ fill:'rgba(255,255,255,0.04)' }}
                contentStyle={{ background:'#161B25', border:'1px solid #222834', borderRadius:10, fontSize:15.5 }}
                labelStyle={{ color:'#EDEAE3', fontWeight:700, marginBottom:4 }}
                itemStyle={{ color:'#EDEAE3' }}
                formatter={v => [formatWon(v), '합계']}/>
              <Bar dataKey="total" radius={[4,4,4,4]}>
                {chartData.map((d,i) => <Cell key={i} fill={d.total>=0?'#4ADE80':'#C9645A'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <SectionCard style={{ padding:'24px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>월별 저축 현황</h3>
          <YearDropdown years={dataYears} selected={selectedYear} onSelect={setSelectedYear}/>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ fontSize:15.5, width:'100%', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ color:'#8A8780', fontSize:14 }}>
                <th style={{ textAlign:'left', fontWeight:500, paddingBottom:10, width:'4%', whiteSpace:'nowrap' }}>월</th>
                {cols.map((c, i) => (
                  <ColMenuHeader
                    key={c.key}
                    col={c}
                    isLast={false}
                    colWidth={`${Math.floor(80/cols.length)}%`}
                    activeMenu={activeMenu === c.key}
                    onToggleMenu={e => { e.stopPropagation(); setActiveMenu(activeMenu === c.key ? null : c.key); }}
                    onDelete={() => { setColToDelete(c); setActiveMenu(null); }}
                    onAdd={addCol}
                    onRename={v => { setCols(prev => prev.map(col => col.key===c.key ? {...col, label:v} : col)); setActiveMenu(null); }}
                  />
                ))}
                <th style={{ width:'4%', paddingLeft:16, paddingBottom:10, verticalAlign:'bottom' }}>
                  <div
                    onClick={addCol}
                    style={{ cursor:'pointer', color:'#5C594F', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:6, padding:'3px 5px' }}
                    onMouseEnter={e => { e.currentTarget.style.color='#8A8780'; e.currentTarget.style.background='rgba(212,175,106,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color='#5C594F'; e.currentTarget.style.background='transparent'; }}>
                    <Plus size={16} strokeWidth={2}/>
                  </div>
                </th>
                <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10 }}>합계</th>
                <th style={{ width:0, padding:0 }}></th>
              </tr>
            </thead>
            <tbody>
              {monthsOfYear.map(r => (
                <tr key={r.month} style={{ borderTop:'1px solid #1A2029' }}>
                  <td style={{ padding:'9px 0', fontWeight:600 }}>{r.label}</td>
                  {cols.map(c => (
                    <MemoNumberCell key={c.key} value={r[c.key]||0}
                      memo={memos[r.month+':'+c.key]||''}
                      onCommit={v => updateField(r, c.key, v)}
                      onMemoSave={text => setMemos(prev => ({ ...prev, [r.month+':'+c.key]: text }))}
                    />
                  ))}
                  <td style={{ width:40 }}></td>
                  <td style={{ textAlign:'right', fontWeight:700, color:r.total>=0?'#4ADE80':'#D98273', fontVariantNumeric:'tabular-nums' }}>{r.total.toLocaleString()}</td>
                  <td style={{ width:0, padding:0 }}></td>
                </tr>
              ))}
              <tr style={{ borderTop:'2px solid #222834' }}>
                <td style={{ padding:'10px 0', fontWeight:700 }}>합계</td>
                {cols.map(c => (
                  <td key={c.key} style={{ textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{monthsOfYear.reduce((s,r) => s+(r[c.key]||0), 0).toLocaleString()}</td>
                ))}
                <td style={{ width:40 }}></td>
                {(()=>{ const t=monthsOfYear.reduce((s,r)=>s+r.total,0); return <td style={{ textAlign:'right', fontWeight:700, color:t>=0?'#4ADE80':'#D98273', fontVariantNumeric:'tabular-nums' }}>{t.toLocaleString()}</td>; })()}
                <td style={{ width:0, padding:0 }}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <ConfirmDeleteModal
          open={!!colToDelete}
          itemName={colToDelete ? colToDelete.label : null}
          onConfirm={confirmDeleteCol}
          onCancel={() => setColToDelete(null)}
        />
      </SectionCard>
    </div>
  );
}

function ProjDeleteBtn({ onDelete }) {
  useEffect(() => {
    const id = 'proj-row-style';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = '.proj-row .del-btn { opacity:0; transition:opacity 0.15s; } .proj-row:hover .del-btn { opacity:1; }';
      document.head.appendChild(el);
    }
  }, []);
  return (
    <span className="del-btn"
      style={{ display:'inline-flex', alignItems:'center', marginLeft:4, verticalAlign:'middle' }}>
      <button onClick={onDelete}
        style={{ background:'transparent', border:'none', color:'#D98273', padding:'0 2px', cursor:'pointer',
          display:'inline-flex', alignItems:'center' }}>
        <Trash2 size={14}/>
      </button>
    </span>
  );
}

function MoneyRulesPage({ showSnack, rules, setRules }) {
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const dragId = useRef(null);
  const dragOverId = useRef(null);

  function addRule() {
    setRules(prev => [...prev, { id:'r'+Date.now(), text:'' }]);
  }
  function updateRule(id, text) {
    setRules(prev => prev.map(r => r.id===id ? {...r, text} : r));
  }
  function deleteRule(id) {
    const snap = [...rules];
    const target = rules.find(r => r.id === id);
    setRules(prev => prev.filter(r => r.id !== id));
    setRuleToDelete(null);
    showSnack(`"${target?.text || '항목'}"을 삭제했어요.`, () => setRules(snap));
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <SectionCard style={{ padding:'24px 28px' }}>
        <h3 style={{ margin:'0 0 14px', fontSize:16, fontWeight:700 }}>지출 규칙</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          {rules.map((r, i) => (
            <RuleRow key={r.id} rule={r}
              isLast={i === rules.length - 1}
              onCommit={v => updateRule(r.id, v)}
              onDelete={() => setRuleToDelete(r.id)}
              onDragStart={() => { dragId.current = r.id; }}
              onDragOver={() => { dragOverId.current = r.id; }}
              onDrop={() => {
                if (!dragId.current || dragId.current === dragOverId.current) return;
                setRules(prev => {
                  const arr = [...prev];
                  const from = arr.findIndex(x => x.id === dragId.current);
                  const to = arr.findIndex(x => x.id === dragOverId.current);
                  const [item] = arr.splice(from, 1);
                  arr.splice(to, 0, item);
                  return arr;
                });
                dragId.current = null; dragOverId.current = null;
              }}
            />
          ))}
        </div>
        <div onClick={addRule}
          style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:14,
            color:'#5C594F', fontSize:14, cursor:'pointer', padding:'4px 6px', borderRadius:6 }}
          onMouseEnter={e => { e.currentTarget.style.color='#8A8780'; e.currentTarget.style.background='rgba(255,255,255,0.04)'; }}
          onMouseLeave={e => { e.currentTarget.style.color='#5C594F'; e.currentTarget.style.background='transparent'; }}>
          <Plus size={13}/> 항목 추가
        </div>
        <ConfirmDeleteModal
          open={!!ruleToDelete}
          itemName="이 항목"
          onConfirm={() => deleteRule(ruleToDelete)}
          onCancel={() => setRuleToDelete(null)}
        />
      </SectionCard>
    </div>
  );
}

function RuleRow({ rule, isLast, onCommit, onDelete, onDragStart, onDragOver, onDrop }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rule.text || '');
  const [hover, setHover] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  function commit() {
    setEditing(false);
    const t = draft.trim();
    if (t !== (rule.text || '')) onCommit(t);
  }

  return (
    <div draggable
      onDragStart={onDragStart} onDragOver={e => { e.preventDefault(); onDragOver(); }} onDrop={onDrop}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display:'flex', gap:6, alignItems:'center', fontSize:16 }}>
      <div className="drag-handle" style={{ opacity: hover ? 1 : 0, transition:'opacity 0.15s', flexShrink:0, marginLeft:-20 }}>
        <GripVertical size={14}/>
      </div>
      {editing ? (
        <input ref={ref} type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') { setEditing(false); setDraft(rule.text||''); } }}
          style={{ ...inputStyle, fontSize:16, padding:'4px 8px', flex:1 }}/>
      ) : (
        <div onClick={() => { setDraft(rule.text||''); setEditing(true); }}
          style={{ flex:1, cursor:'pointer', borderRadius:5, padding:'4px 6px', marginLeft:-6,
            color: rule.text ? '#EDEAE3' : '#5C594F',
            background: hover ? 'rgba(212,175,106,0.08)' : 'transparent',
            lineHeight:'1.5', minHeight:22, display:'flex', alignItems:'center' }}>
          {rule.text || ' '}
        </div>
      )}
      {isLast && (
        <button onClick={onDelete}
          style={{ background:'transparent', border:'none', color: hover ? '#D98273' : 'transparent',
            padding:4, borderRadius:6, cursor:'pointer', display:'inline-flex', alignItems:'center',
            transition:'color 0.15s', flexShrink:0 }}>
          <Trash2 size={13}/>
        </button>
      )}
    </div>
  );
}

function ProjectionPage({ projection, setProjection, assets, showSnack, notes, setNotes, goal }) {
  useEffect(() => {
    const id = 'proj-hover-style';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id;
      el.textContent = '.proj-last-row-btn{opacity:0;transition:opacity 0.15s}.proj-last-row:hover .proj-last-row-btn{opacity:1}';
      document.head.appendChild(el);
    }
  }, []);
  const totals = useMemo(() => assets.reduce((s,a) => s+a.current, 0), [assets]);
  const [hoverRow, setHoverRow] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [projCols, setProjCols] = useState([
    { key:'deposit', label:'전세금' },
    { key:'union',   label:'지역주택조합' },
    { key:'stock',   label:'현금·주식' },
    { key:'loan',    label:'대출금' },
  ]);
  const [activeColMenu, setActiveColMenu] = useState(null);
  const [colToDelete, setColToDelete] = useState(null);
  const [noteToDelete, setNoteToDelete] = useState(null);

  function addProjCol() {
    const newKey = 'pcol_' + Date.now();
    setProjCols(prev => [...prev, { key: newKey, label: '새 항목' }]);
  }
  function confirmDeleteProjCol() {
    const snap = [...projCols];
    const label = colToDelete.label;
    setProjCols(prev => prev.filter(c => c.key !== colToDelete.key));
    setColToDelete(null);
    showSnack(`"${label}" 컬럼을 삭제했어요.`, () => setProjCols(snap));
  }

  const rows = useMemo(() => projection.map(p => ({
    ...p,
    total: projCols.reduce((s,c) => s + (Number(p[c.key]) || 0), 0),
  })), [projection, projCols]);
  const lastYear = rows.length ? Math.max(...rows.map(r => r.year)) : null;

  const chartData = rows.map(r => ({
    year: String(r.year), '목표':r.total,
    '실제': r.year===2026?totals:r.year<2026?r.total:null,
  }));

  const STEP = 500000000;
  const yAxisTicks = useMemo(() => {
    const maxV = Math.max(...chartData.map(d=>Math.max(d['목표']||0,d['실제']||0)),goal,STEP);
    const top = Math.ceil(maxV/STEP)*STEP;
    const t=[]; for(let v=0;v<=top;v+=STEP)t.push(v); return t;
  }, [chartData]);

  function updateField(year,field,value) { setProjection(projection.map(p=>p.year===year?{...p,[field]:value}:p)); }
  function addYear() {
    const last=projection.length?Math.max(...projection.map(p=>p.year)):2025;
    const newRow = {year:last+1,deposit:0,union:0,stock:0,loan:0,note:''};
    setProjection([...projection, newRow]);
    showSnack(`${last+1}년 행이 추가됐어요.`);
  }
  function addNoteYear() {
    const last = notes.length ? Math.max(...notes.map(n => n.year)) : 2025;
    setNotes([...notes, { year: last + 1, note: '' }]);
  }
  function updateNote(year, value) {
    setNotes(notes.map(n => n.year === year ? { ...n, note: value } : n));
  }
  function deleteNote(year) {
    setNotes(notes.filter(n => n.year !== year));
  }
  function confirmDeleteNote() {
    deleteNote(noteToDelete);
    setNoteToDelete(null);
  }
  function confirmDelete() {
    const snapshot = [...projection];
    const label = `${deleteTarget.year}년`;
    setProjection(projection.filter(p=>p.year!==deleteTarget.year));
    setDeleteTarget(null);
    showSnack(`${label} 행을 삭제했어요.`, () => setProjection(snapshot));
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <SectionCard style={{ padding:'24px 28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>경제적 자유</h3>
          <div style={{ display:'flex', gap:14, fontSize:14, color:'#8A8780' }}>
            <span><span style={{ display:'inline-block', width:14, height:2, background:'#4ADE80', marginRight:5, verticalAlign:'middle' }}/>실제</span>
            <span><span style={{ display:'inline-block', width:14, height:0, borderTop:'2px dashed #8A8780', marginRight:5, verticalAlign:'middle' }}/>목표</span>
          </div>
        </div>
        <div style={{ width:'100%', height:240, marginTop:8 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top:10, right:16, left:-6, bottom:0 }}>
              <defs>
                <linearGradient id="paf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4ADE80" stopOpacity={0.35}/>
                  <stop offset="100%" stopColor="#4ADE80" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1A2029" vertical={false}/>
              <XAxis dataKey="year" tick={{ fill:'#8A8780', fontSize:14 }} axisLine={{ stroke:'#222834' }} tickLine={false}/>
              <YAxis ticks={yAxisTicks} domain={[0,yAxisTicks[yAxisTicks.length-1]]}
                tickFormatter={v=>v>0&&v%1000000000===0?`${Math.round(v/100000000)}억`:''}
                tick={{ fill:'#8A8780', fontSize:14 }} axisLine={false} tickLine={false} width={42}/>
              <ReferenceLine y={goal} stroke="#4ADE80" strokeDasharray="4 4"
                label={{ value:`목표 ${formatEokShort(goal)}`, position:'insideTopRight', fill:'#4ADE80', fontSize:13 }}/>
              <Tooltip contentStyle={{ background:'#161B25', border:'1px solid #222834', borderRadius:10, fontSize:15.5 }}
                labelStyle={{ color:'#EDEAE3', fontWeight:700 }}
                formatter={(v,n)=>v==null?['-',n]:[formatEok(v),n]}/>
              <Line type="monotone" dataKey="목표" stroke="#9A9183" strokeWidth={1.5} strokeDasharray="5 4" dot={{ r:2.5, fill:'#9A9183' }}/>
              <Area type="monotone" dataKey="실제" stroke="#4ADE80" strokeWidth={2.5} fill="url(#paf)" dot={{ r:3, fill:'#4ADE80' }} connectNulls={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <SectionCard style={{ padding:'24px 28px' }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:16 }}>연도별 목표 시나리오</h3>
        <div style={{ overflow:'visible' }}>
          <table style={{ fontSize:15.5, width:'100%', tableLayout:'fixed' }}>
            <thead>
              <tr style={{ color:'#8A8780', fontSize:14 }}>
                <th style={{ textAlign:'left', fontWeight:500, paddingBottom:10, paddingRight:24, whiteSpace:'nowrap' }}>연도</th>
                {projCols.map((c, i) => (
                  <ColMenuHeader
                    key={c.key}
                    col={c}
                    isLast={false}
                    colWidth={`${Math.floor(80/projCols.length)}%`}
                    activeMenu={activeColMenu === c.key}
                    onToggleMenu={e => { e.stopPropagation(); setActiveColMenu(activeColMenu === c.key ? null : c.key); }}
                    onDelete={() => { setColToDelete(c); setActiveColMenu(null); }}
                    onAdd={addProjCol}
                  />
                ))}
                <th style={{ width:'4%', paddingLeft:16, paddingBottom:10, verticalAlign:'bottom' }}>
                  <div
                    onClick={addProjCol}
                    style={{ cursor:'pointer', color:'#5C594F', display:'inline-flex', alignItems:'center', justifyContent:'center', borderRadius:6, padding:'3px 5px' }}
                    onMouseEnter={e => { e.currentTarget.style.color='#8A8780'; e.currentTarget.style.background='rgba(212,175,106,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color='#5C594F'; e.currentTarget.style.background='transparent'; }}>
                    <Plus size={16} strokeWidth={2}/>
                  </div>
                </th>
                <th style={{ textAlign:'right', fontWeight:500, paddingBottom:10, width:`${Math.floor(60/projCols.length)}%` }}>합계</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isCur=r.year===2026, isPast=r.year<2026;
                return (
                  <tr key={r.year} className={r.year === lastYear ? "proj-last-row" : ""}
                    style={{ borderTop:'1px solid #1A2029', background:isCur?'rgba(74,222,128,0.08)':'transparent', opacity:isPast?0.5:1 }}>
                    <td style={{ padding:'9px 0', color:isCur?'#4ADE80':'#EDEAE3', fontWeight:isCur?700:600, whiteSpace:'nowrap' }}>{r.year}{isCur?' (현재)':''}</td>
                    {projCols.map(c => (
                      <EditableNumberCell key={c.key} value={r[c.key]||0}
                        onCommit={v=>updateField(r.year,c.key,v)}/>
                    ))}
                    <td></td>
                    <td style={{ textAlign:'right', fontWeight:700, color:r.total<0?'#D98273':'#4ADE80', fontVariantNumeric:'tabular-nums', position:'relative', overflow:'visible' }}>
                      {r.total.toLocaleString()}
                      {r.year === lastYear && (
                        <button className="proj-last-row-btn" onClick={()=>setDeleteTarget(r)}
                          style={{ background:'transparent', border:'none', color:'#D98273', padding:'0 0 0 4px', cursor:'pointer', display:'inline-flex', alignItems:'center',
                            position:'absolute', left:'100%', top:'50%', transform:'translateY(-50%)' }}>
                          <Trash2 size={14}/>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ConfirmDeleteModal
          open={!!colToDelete}
          itemName={colToDelete ? colToDelete.label : null}
          onConfirm={confirmDeleteProjCol}
          onCancel={() => setColToDelete(null)}
        />
        <ConfirmDeleteModal
          open={!!noteToDelete}
          itemName={noteToDelete ? noteToDelete + '년 비고' : null}
          onConfirm={confirmDeleteNote}
          onCancel={() => setNoteToDelete(null)}
        />
        <div style={{ display:'flex', justifyContent:'center', marginTop:18 }}>
          <button onClick={addYear}
            style={{ ...btnGhostStyle }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#EDEAE3'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#8A8780'; }}
          >+ 연도 추가</button>
        </div>
        <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:4 }}>
          {notes.map((n, i) => (
            <EditableNoteRow key={n.year} year={n.year} note={n.note}
              onCommit={v => updateNote(n.year, v)}
              isLast={i === notes.length - 1}
              onDelete={() => setNoteToDelete(n.year)}
            />
          ))}
          <div
            onClick={addNoteYear}
            style={{ display:'flex', alignItems:'center', gap:6, marginTop:4, padding:'4px 8px', marginLeft:-2,
              color:'#5C594F', fontSize:14, cursor:'pointer', borderRadius:6, width:'fit-content',
              transition:'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color='#EDEAE3'; }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#5C594F'; }}
          >
            <span style={{ fontSize:14, lineHeight:1 }}>+</span> 연도 추가
          </div>
        </div>
      </SectionCard>
      <ConfirmDeleteModal
        open={!!deleteTarget}
        itemName={deleteTarget ? `${deleteTarget.year}년` : null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function SettingsPage({ goal, setGoal }) {
  const [draft, setDraft] = useState(goal);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <SectionCard style={{ padding:'24px 28px', maxWidth:480 }}>
        <h3 style={{ margin:0, fontSize:16, fontWeight:700, marginBottom:6 }}>FIRE 목표 금액</h3>
        <p style={{ margin:'0 0 16px', fontSize:15.5, color:'#8A8780' }}>은퇴 후 연 지출의 25배(4% 룰)를 기준으로 잡거나, 직접 목표 금액을 입력하세요.</p>
        <div style={{ display:'flex', gap:10 }}>
          <input type="number" value={draft} onChange={e=>setDraft(e.target.value)} style={{ ...inputStyle, fontSize:14, padding:'10px 12px', flex:1 }}/>
          <button onClick={()=>setGoal(Number(draft)||FIRE_GOAL)} style={btnPrimaryStyle}>저장</button>
        </div>
        <div style={{ marginTop:10, fontSize:14, color:'#5C594F' }}>현재 목표: {formatEok(goal)}</div>
      </SectionCard>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [assets, setAssets] = useState(INITIAL_ASSETS);
  const [monthly, setMonthly] = useState(INITIAL_MONTHLY);
  const [projection, setProjection] = useState(INITIAL_PROJECTION);
  const [notes, setNotes] = useState(INITIAL_PROJECTION.map(p => ({ year: p.year, note: p.note })));
  const [goal, setGoal] = useState(FIRE_GOAL);
  const [cols, setCols] = useState([
    { key:'yongwookIncome', label:'남편 소득' },
    { key:'hannaIncome',    label:'아내 소득' },
    { key:'expense',        label:'지출' },
    { key:'stockGain',      label:'주식 수익' },
    { key:'etc',            label:'기타 비용' },
  ]);
  const [dashSummary, setDashSummary] = useState([
    { id:'s1', label:'소득', keys:['yongwookIncome','hannaIncome'] },
    { id:'s2', label:'주식 수익', keys:['stockGain'] },
    { id:'s3', label:'지출', keys:['expense'] },
    { id:'s4', label:'기타 비용', keys:['etc'] },
  ]);
  const [memos, setMemos] = useState({});
  const [rules, setRules] = useState([{ id:'r1', text:'' }]);
  const [loaded, setLoaded] = useState(false);
  const { snack, showSnack, dismiss } = useSnackbar();

  useEffect(() => {
    async function loadData() {
      try {
        const snap = await getDoc(doc(db, 'data', 'friend'));
        if (snap.exists()) {
          const d = snap.data();
          if (d.assets) setAssets(d.assets);
          if (d.monthly) setMonthly(d.monthly);
          if (d.projection) setProjection(d.projection);
          if (d.notes) setNotes(d.notes);
          if (d.goal) setGoal(d.goal);
          if (d.cols) setCols(d.cols);
          if (d.dashSummary) setDashSummary(d.dashSummary);
          if (d.memos) setMemos(d.memos);
          if (d.rules) setRules(d.rules);
        }
      } catch(e) { console.error(e); }
      setLoaded(true);
    }
    loadData();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      try {
        await setDoc(doc(db, 'data', 'friend'), { assets, monthly, projection, notes, goal, cols, dashSummary, memos, rules });
      } catch(e) { console.error(e); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [assets, monthly, projection, notes, goal, cols, dashSummary, memos, rules, loaded]);

  const headerDateLabel = useMemo(() => {
    const valid = monthly.filter(m => m.month && (m.yongwookIncome||m.hannaIncome||m.expense||m.stockGain||m.etc));
    if (!valid.length) return '데이터 없음';
    const last = valid.reduce((l,m) => m.month>l.month?m:l, valid[0]);
    const [y,m] = last.month.split('-');
    return `${y}년 ${parseInt(m,10)}월 기준`;
  }, [monthly]);

  return (
    <div className="fire-wrap">
      <style>{CSS}</style>
      <aside style={{ width:200, flexShrink:0, borderRight:'1px solid #222834', padding:'22px 14px', display:'flex', flexDirection:'column', gap:4 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'0 8px', marginBottom:22 }}>
          <Zap size={20} color="#4ADE80" fill="#4ADE80" strokeWidth={1.5} />
          <span style={{ fontSize:15, fontWeight:800, letterSpacing:'-0.01em' }}>쉬었음 청년을 향해</span>
        </div>
        {NAV_ITEMS.map(item => {
          const active = page === item.id;
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setPage(item.id)}
              style={{ display:'flex', alignItems:'center', gap:10, background:active?'#11151D':'transparent', border:'none', borderRadius:9, padding:'9px 10px', cursor:'pointer', textAlign:'left', transition:'background 0.15s' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background='#11151D'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} color={active ? '#4ADE80' : '#8A8780'} />
              <span>
                <div style={{ fontSize:14, fontWeight:active?700:500, color:active?'#EDEAE3':'#8A8780' }}>{item.label}</div>
                <div style={{ fontSize:14, color: active ? '#AEACA6' : '#5C594F' }}>{item.sub}</div>
              </span>
            </button>
          );
        })}
      </aside>
      <main style={{ flex:1, padding:'24px 28px 40px', minWidth:0, overflowX:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:21, fontWeight:800, letterSpacing:'-0.01em' }}>{NAV_ITEMS.find(n=>n.id===page)?.label}</h1>
            <p style={{ margin:'4px 0 0', fontSize:15.5, color:'#8A8780' }}>
              {NAV_ITEMS.find(n => n.id === page)?.sub}
            </p>
          </div>
          <div style={{ fontSize:14, color:'#8A8780', background:'#11151D', border:'1px solid #222834', padding:'6px 12px', borderRadius:20, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#4ADE80', display:'inline-block' }}/>
            {headerDateLabel}
          </div>
        </div>
        {page==='dashboard' && <DashboardPage assets={assets} monthly={monthly} projection={projection} goal={goal} setGoal={setGoal} cols={cols} dashSummary={dashSummary} setDashSummary={setDashSummary}/>}
        {page==='assets' && <AssetsPage assets={assets} setAssets={setAssets} showSnack={showSnack}/>}
        {page==='growth' && <GrowthPage monthly={monthly} setMonthly={setMonthly} showSnack={showSnack} cols={cols} setCols={setCols} memos={memos} setMemos={setMemos}/>}
        {page==='projection' && <ProjectionPage projection={projection} setProjection={setProjection} assets={assets} showSnack={showSnack} notes={notes} setNotes={setNotes} goal={goal}/>}
        {page==='moneyrules' && <MoneyRulesPage showSnack={showSnack} rules={rules} setRules={setRules}/>}
        {page==='settings' && null}
      </main>
      <Snackbar snack={snack} onUndo={() => {}} onDismiss={dismiss}/>
    </div>
  );
}
