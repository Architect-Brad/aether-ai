/**
 * ████████████████████████████████████████████████████████████████████████████
 *
 *   DOCUMENTS SUPREMACY  —  AETHER Skill  v1.0.0
 *   Single-file browser-native office document engine.
 *
 *   Formats  :  .docx  .odt  .pptx  .xlsx  .db  .csv
 *   Templates:  28 production-ready templates
 *   Features :  Create · Read · Rebuild · Images · SQL
 *   Deps     :  docx@8 · pptxgenjs@3 · xlsx@0.18 · sql.js@1.10 · mammoth@1.6 · jszip@3.10
 *               All lazy-loaded from esm.sh — zero bundle cost until used.
 *
 *   Usage:
 *     import DocumentsSupremacy from './documents-supremacy.js'
 *     await DocumentsSupremacy.execute(spec, container)
 *     await DocumentsSupremacy.rebuild(file, "rewrite as bullet points", apiKey, container)
 *
 * ████████████████████████████████████████████████████████████████████████████
 */

// ═══════════════════════════════════════════════════════════════════════════════
// §1  LAZY LOADERS
// ═══════════════════════════════════════════════════════════════════════════════

const _cache = {};
async function _load(key, url) {
  if (_cache[key]) return _cache[key];
  const m = await import(url);
  _cache[key] = m.default || m;
  return _cache[key];
}

const loadDocx     = () => _load('docx',     'https://esm.sh/docx@8');
const loadMammoth  = () => _load('mammoth',  'https://esm.sh/mammoth@1.6.0');
const loadJSZip    = () => _load('jszip',    'https://esm.sh/jszip@3.10.1');
const loadPptxGen  = () => _load('pptxgen',  'https://esm.sh/pptxgenjs@3.12.0');
const loadXLSX     = () => _load('xlsx',     'https://esm.sh/xlsx@0.18.5');
const loadSQL      = async () => {
  if (_cache.sql) return _cache.sql;
  const init = (await import('https://esm.sh/sql.js@1.10.2')).default;
  _cache.sql = await init({ locateFile: f => `https://esm.sh/sql.js@1.10.2/dist/${f}` });
  return _cache.sql;
};

// ═══════════════════════════════════════════════════════════════════════════════
// §2  SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const inToDxa  = i  => Math.round(i * 1440);
const ptToHalf = pt => pt * 2;
const hex      = h  => (h || '000000').replace('#', '');
const esc      = s  => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const cm       = i  => (i * 2.54).toFixed(3) + 'cm';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function extractSpec(text) {
  if (!text) return null;
  for (const s of [text.trim(), text.replace(/```(?:json)?\s*([\s\S]*?)```/g,'$1').trim()]) {
    try { const p = JSON.parse(s); if (p.type) return p; } catch {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §3  IMAGE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

class ImageRegistry {
  constructor() { this._s = {}; }
  async fromFile(file, id) {
    const imageId = id || file.name.replace(/[^a-zA-Z0-9_-]/g,'_');
    const base64  = await new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); });
    const dims    = await new Promise(res => { const img=new Image(); img.onload=()=>res({width:img.naturalWidth,height:img.naturalHeight}); img.onerror=()=>res({width:0,height:0}); img.src=`data:${file.type};base64,${base64}`; });
    this._s[imageId] = { id:imageId, filename:`${imageId}.${file.type.split('/')[1]||'png'}`, data:base64, mimeType:file.type, ...dims, size:file.size };
    return imageId;
  }
  fromBase64(b64, mime, id) {
    const imageId = id || 'img_'+Math.random().toString(36).slice(2);
    this._s[imageId] = { id:imageId, filename:`${imageId}.${mime.split('/')[1]||'png'}`, data:b64.replace(/^data:[^;]+;base64,/,''), mimeType:mime||'image/png' };
    return imageId;
  }
  get(id)    { return this._s[id]||null; }
  list()     { return Object.values(this._s); }
  toObject() { return {...this._s}; }
}

export const imageRegistry = new ImageRegistry();

// ═══════════════════════════════════════════════════════════════════════════════
// §4  DOCX ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const PAGE_SIZES = { letter:{width:12240,height:15840}, a4:{width:11906,height:16838}, legal:{width:12240,height:20160} };
const CALLOUT_STYLES = {
  info:   {bg:'D6E4F0',accent:'2E75B6',label:'ℹ  Info'},
  warning:{bg:'FFF3CD',accent:'B8860B',label:'⚠  Warning'},
  tip:    {bg:'D4EDDA',accent:'28A745',label:'✓  Tip'},
  note:   {bg:'F8F9FA',accent:'6C757D',label:'📝  Note'},
};

function _docxStyles(d, theme) {
  const font=theme?.font||'Arial', accent=hex(theme?.accentColor||'2E75B6'), h=theme?.headings||{};
  return {
    default:{ document:{ run:{ font, size:ptToHalf(theme?.fontSize||12) } } },
    paragraphStyles:[
      { id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:ptToHalf(h.h1?.size||28),bold:true,color:hex(h.h1?.color||'1F3864'),font},
        paragraph:{spacing:{before:360,after:120},outlineLevel:0,border:{bottom:{style:d.BorderStyle.SINGLE,size:6,color:accent,space:4}}} },
      { id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:ptToHalf(h.h2?.size||22),bold:true,color:hex(h.h2?.color||accent),font},
        paragraph:{spacing:{before:240,after:80},outlineLevel:1} },
      { id:'Heading3',name:'Heading 3',basedOn:'Normal',next:'Normal',quickFormat:true,
        run:{size:ptToHalf(h.h3?.size||18),bold:true,color:hex(h.h3?.color||'404040'),font},
        paragraph:{spacing:{before:180,after:60},outlineLevel:2} },
      { id:'Hyperlink',name:'Hyperlink',basedOn:'Normal',run:{color:accent,underline:{type:'single'}} },
    ],
  };
}

function _docxNumbering(d) {
  return { config:[
    { reference:'aether-bullets', levels:[
        {level:0,format:d.LevelFormat.BULLET,text:'•',alignment:d.AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}},
        {level:1,format:d.LevelFormat.BULLET,text:'◦',alignment:d.AlignmentType.LEFT,style:{paragraph:{indent:{left:1080,hanging:360}}}},
      ]},
    { reference:'aether-numbers', levels:[
        {level:0,format:d.LevelFormat.DECIMAL,text:'%1.',alignment:d.AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}}}},
      ]},
  ]};
}

function _makeRun(d, run, theme) {
  if (run.footnote) return null;
  const font=theme?.font||'Arial';
  const opts={text:run.text||'',font,bold:run.bold||false,italics:run.italic||run.italics||false,underline:run.underline?{}:undefined,strike:run.strike||false,color:hex(run.color),size:run.size?ptToHalf(run.size):undefined};
  if (run.link) return new d.ExternalHyperlink({link:run.link,children:[new d.TextRun({...opts,style:'Hyperlink'})]});
  return new d.TextRun(opts);
}

function _resolveRuns(d, block, theme, fnMap) {
  if (!block.runs) return [new d.TextRun({text:block.text||'',font:theme?.font||'Arial'})];
  const children=[];
  block.runs.forEach(run => {
    if (run.footnote) { const id=Object.keys(fnMap).length; fnMap[id]=run.footnote; children.push(new d.FootnoteReferenceRun(id)); return; }
    const r=_makeRun(d,run,theme); if (r) children.push(r);
  });
  return children;
}

function _bParagraph(d,block,theme,fnMap) {
  const alignMap={left:d.AlignmentType.LEFT,center:d.AlignmentType.CENTER,right:d.AlignmentType.RIGHT,justify:d.AlignmentType.JUSTIFIED};
  return new d.Paragraph({children:_resolveRuns(d,block,theme,fnMap),alignment:alignMap[block.align]||d.AlignmentType.LEFT,spacing:block.spacing||{before:0,after:160}});
}

function _bHeading(d,block,theme) {
  const lvl={1:d.HeadingLevel.HEADING_1,2:d.HeadingLevel.HEADING_2,3:d.HeadingLevel.HEADING_3,4:d.HeadingLevel.HEADING_4};
  return new d.Paragraph({heading:lvl[block.level]||d.HeadingLevel.HEADING_1,children:[new d.TextRun({text:block.text,font:theme?.font||'Arial'})]});
}

function _bList(d,block,theme) {
  const ref=block.style==='number'?'aether-numbers':'aether-bullets', font=theme?.font||'Arial';
  return block.items.map(item => {
    const text=typeof item==='string'?item:item.text;
    const children=typeof item==='object'&&item.runs?item.runs.map(r=>_makeRun(d,r,theme)).filter(Boolean):[new d.TextRun({text,font})];
    return new d.Paragraph({numbering:{reference:ref,level:0},children});
  });
}

function _bTable(d,block,theme,margins) {
  const accent=hex(block.headerColor||theme?.accentColor||'2E75B6'), font=theme?.font||'Arial';
  const cw=12240-inToDxa((margins?.left||1))-inToDxa((margins?.right||1));
  const colCount=block.headers?.length||block.rows?.[0]?.length||1;
  const border={style:d.BorderStyle.SINGLE,size:1,color:'CCCCCC'};
  const borders={top:border,bottom:border,left:border,right:border};
  const widths=block.widths?block.widths.map(w=>Math.round((w/100)*cw)):Array(colCount).fill(Math.round(cw/colCount));
  const headerRow=new d.TableRow({tableHeader:true,children:(block.headers||[]).map((h,i)=>new d.TableCell({borders,width:{size:widths[i],type:d.WidthType.DXA},shading:{fill:accent,type:d.ShadingType.CLEAR},margins:{top:80,bottom:80,left:120,right:120},children:[new d.Paragraph({children:[new d.TextRun({text:h,bold:true,color:'FFFFFF',font})]})]}) )});
  const dataRows=(block.rows||[]).map((row,ri)=>new d.TableRow({children:row.map((cell,ci)=>new d.TableCell({borders,width:{size:widths[ci],type:d.WidthType.DXA},shading:block.striped&&ri%2===1?{fill:'F2F2F2',type:d.ShadingType.CLEAR}:undefined,margins:{top:80,bottom:80,left:120,right:120},children:[new d.Paragraph({children:[new d.TextRun({text:String(cell),font})]})]})) }));
  return new d.Table({width:{size:cw,type:d.WidthType.DXA},columnWidths:widths,rows:[headerRow,...dataRows]});
}

function _bCallout(d,block,theme) {
  const s=CALLOUT_STYLES[block.style||'info'], font=theme?.font||'Arial';
  return new d.Paragraph({children:[new d.TextRun({text:s.label+'   ',bold:true,color:hex(s.accent),font}),new d.TextRun({text:block.text||'',font})],shading:{fill:s.bg,type:d.ShadingType.CLEAR},border:{left:{style:d.BorderStyle.SINGLE,size:12,color:hex(s.accent),space:8}},indent:{left:180},spacing:{before:120,after:120}});
}

function _bDivider(d,block) {
  return new d.Paragraph({children:[new d.TextRun('')],border:{bottom:{style:d.BorderStyle.SINGLE,size:block.thickness||6,color:hex(block.color||'2E75B6'),space:1}},spacing:{before:120,after:120}});
}

function _bCover(d,cover,theme) {
  const accent=hex(cover.accentColor||theme?.accentColor||'2E75B6'), font=theme?.font||'Arial';
  const out=[];
  for(let i=0;i<8;i++) out.push(new d.Paragraph({children:[new d.TextRun('')]}));
  out.push(new d.Paragraph({alignment:d.AlignmentType.CENTER,children:[new d.TextRun({text:cover.title||'',font,size:72,bold:true,color:hex(cover.accentColor||'1F3864')})],spacing:{before:0,after:240}}));
  out.push(new d.Paragraph({alignment:d.AlignmentType.CENTER,children:[new d.TextRun('')],border:{bottom:{style:d.BorderStyle.SINGLE,size:12,color:accent,space:1}},spacing:{before:0,after:240}}));
  if(cover.subtitle) out.push(new d.Paragraph({alignment:d.AlignmentType.CENTER,children:[new d.TextRun({text:cover.subtitle,font,size:36,color:'555555'})],spacing:{before:0,after:480}}));
  for(let i=0;i<8;i++) out.push(new d.Paragraph({children:[new d.TextRun('')]}));
  if(cover.author) out.push(new d.Paragraph({alignment:d.AlignmentType.CENTER,children:[new d.TextRun({text:cover.author,font,size:28,bold:true})]}));
  if(cover.date)   out.push(new d.Paragraph({alignment:d.AlignmentType.CENTER,children:[new d.TextRun({text:cover.date,font,size:24,color:'888888'})]}));
  out.push(new d.Paragraph({children:[new d.PageBreak()]}));
  return out;
}

function _bHeader(d,spec,theme) {
  if(!spec) return undefined;
  const font=theme?.font||'Arial';
  return new d.Header({children:[new d.Paragraph({children:[new d.TextRun({text:spec.left||'',font,size:18}),new d.TextRun({text:'\t'}),new d.TextRun({text:spec.center||'',font,size:18}),new d.TextRun({text:'\t'}),new d.TextRun({text:spec.right||'',font,size:18})],tabStops:[{type:d.TabStopType.CENTER,position:4680},{type:d.TabStopType.RIGHT,position:d.TabStopPosition.MAX}],border:{bottom:{style:d.BorderStyle.SINGLE,size:4,color:'CCCCCC',space:4}}})]});
}

function _bFooter(d,spec,theme) {
  if(!spec) return undefined;
  const font=theme?.font||'Arial';
  const right=spec.showPageNumber?[new d.TextRun({text:'Page ',font,size:18}),new d.TextRun({children:[d.PageNumber.CURRENT],font,size:18}),new d.TextRun({text:' of ',font,size:18}),new d.TextRun({children:[d.PageNumber.TOTAL_PAGES],font,size:18})]:[new d.TextRun({text:spec.right||'',font,size:18})];
  return new d.Footer({children:[new d.Paragraph({children:[new d.TextRun({text:spec.left||'',font,size:18}),new d.TextRun({text:'\t'}),new d.TextRun({text:spec.center||'',font,size:18}),new d.TextRun({text:'\t'}),...right],tabStops:[{type:d.TabStopType.CENTER,position:4680},{type:d.TabStopType.RIGHT,position:d.TabStopPosition.MAX}],border:{top:{style:d.BorderStyle.SINGLE,size:4,color:'CCCCCC',space:4}}})]});
}

function _processDocxBlock(d,block,theme,fnMap,margins) {
  switch(block.block) {
    case 'heading':   return [_bHeading(d,block,theme)];
    case 'paragraph': return [_bParagraph(d,block,theme,fnMap)];
    case 'list':      return _bList(d,block,theme);
    case 'table':     return [_bTable(d,block,theme,margins)];
    case 'pagebreak': return [new d.Paragraph({children:[new d.PageBreak()]})];
    case 'divider':   return [_bDivider(d,block)];
    case 'callout':   return [_bCallout(d,block,theme)];
    case 'spacer':    return Array(block.lines||1).fill(null).map(()=>new d.Paragraph({children:[new d.TextRun('')]}));
    case 'columns':   return [{__columns:true,block}];
    default: return [];
  }
}

async function _buildDocxDocument(spec) {
  const d=await loadDocx(), theme=spec.theme||{}, page=spec.page||{}, margins=page.margins||{top:1,bottom:1,left:1,right:1};
  const ps=PAGE_SIZES[page.size||'letter'], fnMap={};
  const pageProps={page:{size:{width:ps.width,height:ps.height,...(page.orientation==='landscape'?{orientation:d.PageOrientation.LANDSCAPE}:{})},margin:{top:inToDxa(margins.top),bottom:inToDxa(margins.bottom),left:inToDxa(margins.left),right:inToDxa(margins.right)}}};
  const header=_bHeader(d,spec.header,theme), footer=_bFooter(d,spec.footer,theme);
  const hf={headers:header?{default:header}:undefined,footers:footer?{default:footer}:undefined};
  const sections=[], current=[];
  if(spec.cover) current.push(..._bCover(d,spec.cover,theme));
  for(const block of (spec.body||[])) {
    for(const item of _processDocxBlock(d,block,theme,fnMap,margins)) {
      if(item?.__columns) {
        if(current.length) { sections.push({properties:{...pageProps},...hf,children:[...current]}); current.length=0; }
        const colChildren=[];
        for(const cb of (item.block.content||[])) colChildren.push(..._processDocxBlock(d,cb,theme,fnMap,margins));
        sections.push({properties:{...pageProps,column:{count:item.block.count||2,space:inToDxa(item.block.gap||0.5),equalWidth:true}},...hf,children:colChildren});
      } else { current.push(item); }
    }
  }
  if(current.length||sections.length===0) sections.push({properties:{...pageProps},...hf,children:current});
  const footnotes={};
  for(const [id,text] of Object.entries(fnMap)) footnotes[id]={children:[new d.Paragraph({children:[new d.TextRun({text,font:theme.font||'Arial',size:18})]})]};
  return new d.Document({creator:spec.meta?.author||'AETHER',title:spec.meta?.title||'Document',subject:spec.meta?.subject||'',styles:_docxStyles(d,theme),numbering:_docxNumbering(d),footnotes:Object.keys(footnotes).length?footnotes:undefined,sections});
}

export async function createDocx(spec) {
  const d=await loadDocx(), doc=await _buildDocxDocument(spec), buffer=await d.Packer.toBuffer(doc);
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  const filename=spec.meta?.filename||`${(spec.meta?.title||'document').replace(/\s+/g,'-').toLowerCase()}.docx`;
  return {blob,filename,size:buffer.byteLength};
}

export async function readDocx(file) {
  const mammoth=await loadMammoth(), arrayBuffer=await file.arrayBuffer();
  const [tr,hr]=await Promise.all([mammoth.extractRawText({arrayBuffer}),mammoth.convertToHtml({arrayBuffer})]);
  const doc=new DOMParser().parseFromString(hr.value,'text/html');
  const headings=[...doc.querySelectorAll('h1,h2,h3,h4')].map(h=>({level:parseInt(h.tagName[1]),text:h.textContent.trim()}));
  const tables=[...doc.querySelectorAll('table')].map(t=>[...t.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('td,th')].map(c=>c.textContent.trim())));
  return {text:tr.value,html:hr.value,wordCount:tr.value.split(/\s+/).filter(Boolean).length,headings,tableCount:tables.length,tables,filename:file.name,size:file.size};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §5  ODT ENGINE  (custom XML builder)
// ═══════════════════════════════════════════════════════════════════════════════

const ODT_MIME='application/vnd.oasis.opendocument.text';
const ODT_CALLOUT={info:{bg:'#D6E4F0',border:'#2E75B6',label:'ℹ Info'},warning:{bg:'#FFF3CD',border:'#B8860B',label:'⚠ Warning'},tip:{bg:'#D4EDDA',border:'#28A745',label:'✓ Tip'},note:{bg:'#F8F9FA',border:'#6C757D',label:'📝 Note'}};

function _odtManifest(imgs) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIME}"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
  ${imgs.map(n=>`<manifest:file-entry manifest:full-path="Pictures/${n}" manifest:media-type="image/png"/>`).join('\n')}
</manifest:manifest>`;
}

function _odtMeta(spec) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">
  <office:meta><dc:title>${esc(spec.meta?.title||'')}</dc:title><dc:creator>${esc(spec.meta?.author||'AETHER')}</dc:creator><meta:creation-date>${new Date().toISOString()}</meta:creation-date></office:meta>
</office:document-meta>`;
}

function _odtStyles(spec) {
  const theme=spec.theme||{}, font=theme.font||'Arial', size=theme.fontSize||12;
  const accent=(theme.accentColor||'2E75B6').replace('#',''), h=theme.headings||{};
  const margins=spec.page?.margins||{top:1,bottom:1,left:1,right:1};
  const landscape=spec.page?.orientation==='landscape';
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0">
<office:font-face-decls><style:font-face style:name="${font}" svg:font-family="${font}"/></office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:text-properties fo:font-family="${font}" fo:font-size="${size}pt"/></style:default-style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:next-style-name="Standard"><style:paragraph-properties fo:margin-top="0.25cm" fo:margin-bottom="0.1cm" fo:border-bottom="0.06cm solid #${accent}" fo:padding-bottom="0.1cm"/><style:text-properties fo:font-family="${font}" fo:font-size="${h.h1?.size||22}pt" fo:font-weight="bold" fo:color="#${hex(h.h1?.color||'1F3864')}"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:next-style-name="Standard"><style:paragraph-properties fo:margin-top="0.18cm" fo:margin-bottom="0.06cm"/><style:text-properties fo:font-family="${font}" fo:font-size="${h.h2?.size||18}pt" fo:font-weight="bold" fo:color="#${hex(h.h2?.color||accent)}"/></style:style>
<style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:next-style-name="Standard"><style:paragraph-properties fo:margin-top="0.12cm" fo:margin-bottom="0.04cm"/><style:text-properties fo:font-family="${font}" fo:font-size="${h.h3?.size||14}pt" fo:font-weight="bold" fo:color="#${hex(h.h3?.color||'404040')}"/></style:style>
<style:style style:name="List_20_Bullet" style:display-name="List Bullet" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.5cm" fo:text-indent="-0.25cm" fo:margin-bottom="0.08cm"/></style:style>
<style:style style:name="List_20_Number" style:display-name="List Number" style:family="paragraph"><style:paragraph-properties fo:margin-left="0.5cm" fo:text-indent="-0.25cm" fo:margin-bottom="0.08cm"/></style:style>
<style:page-layout style:name="PageLayout">
  <style:page-layout-properties fo:page-width="${landscape?'27.94cm':'21.59cm'}" fo:page-height="${landscape?'21.59cm':'27.94cm'}" fo:margin-top="${cm(margins.top)}" fo:margin-bottom="${cm(margins.bottom)}" fo:margin-left="${cm(margins.left)}" fo:margin-right="${cm(margins.right)}" style:print-orientation="${landscape?'landscape':'portrait'}"/>
</style:page-layout>
<style:master-page style:name="Standard" style:page-layout-name="PageLayout"/>
</office:styles>
</office:document-styles>`;
}

function _odtRun(run, font) {
  if(!run.text&&!run.footnote) return '';
  if(run.footnote) return `<text:note text:id="fn${Math.random().toString(36).slice(2)}" text:note-class="footnote"><text:note-body><text:p text:style-name="Standard">${esc(run.footnote)}</text:p></text:note-body></text:note>`;
  const styles=[];
  if(run.bold) styles.push('fo:font-weight="bold"');
  if(run.italic||run.italics) styles.push('fo:font-style="italic"');
  if(run.underline) styles.push('style:text-underline-style="solid"');
  if(run.color) styles.push(`fo:color="#${run.color.replace('#','')}"`);;
  const inner=esc(run.text);
  if(run.link) return `<text:a xlink:type="simple" xlink:href="${esc(run.link)}">${inner}</text:a>`;
  if(styles.length===0) return inner;
  return `<text:span style:override="${styles.join(' ')}">${inner}</text:span>`;
}

function _odtRuns(block,font) { return block.runs?block.runs.map(r=>_odtRun(r,font)).join(''):esc(block.text||''); }

function _processOdtBlock(block,theme,imgs) {
  const font=theme?.font||'Arial', accent='#'+(theme?.accentColor||'2E75B6').replace('#','');
  const aligns={left:'start',center:'center',right:'end',justify:'justify'};
  switch(block.block) {
    case 'heading': { const s={1:'Heading_20_1',2:'Heading_20_2',3:'Heading_20_3',4:'Heading_20_3'}; return `<text:h text:style-name="${s[block.level]||'Heading_20_1'}" text:outline-level="${block.level}">${esc(block.text)}</text:h>`; }
    case 'paragraph': return `<text:p text:style-name="Standard" fo:text-align="${aligns[block.align]||'start'}">${_odtRuns(block,font)}</text:p>`;
    case 'list': return block.items.map((item,i)=>`<text:p text:style-name="${block.style==='number'?'List_20_Number':'List_20_Bullet'}">${block.style==='number'?`${i+1}. `:'• '}${typeof item==='string'?esc(item):_odtRuns(item,font)}</text:p>`).join('\n');
    case 'table': {
      const cols=block.headers?.length||block.rows?.[0]?.length||1;
      const acc='#'+(block.headerColor||theme?.accentColor||'2E75B6').replace('#','');
      const colDefs=Array(cols).fill(null).map(()=>`<table:table-column/>`).join('');
      const hRow=block.headers?`<table:table-row>${block.headers.map(h=>`<table:table-cell fo:background-color="${acc}" fo:padding="0.1cm" fo:border="0.02cm solid #999"><text:p><text:span fo:font-weight="bold" fo:color="#FFFFFF">${esc(h)}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`:'';
      const dRows=(block.rows||[]).map((row,ri)=>`<table:table-row>${row.map(cell=>`<table:table-cell fo:background-color="${block.striped&&ri%2===1?'#F2F2F2':'#FFFFFF'}" fo:padding="0.1cm" fo:border="0.02cm solid #CCCCCC"><text:p><text:span>${esc(String(cell))}</text:span></text:p></table:table-cell>`).join('')}</table:table-row>`).join('\n');
      return `<table:table>${colDefs}${hRow}${dRows}</table:table>`;
    }
    case 'callout': { const s=ODT_CALLOUT[block.style||'info']; return `<text:p text:style-name="Standard" fo:background-color="${s.bg}" fo:border-left="0.08cm solid ${s.border}" fo:padding-left="0.3cm"><text:span fo:font-weight="bold" fo:color="${s.border}">${s.label}   </text:span><text:span>${esc(block.text||'')}</text:span></text:p>`; }
    case 'divider': return `<text:p text:style-name="Standard" fo:border-bottom="0.05cm solid #CCCCCC" fo:padding-bottom="0.1cm"/>`;
    case 'spacer':  return Array(block.lines||1).fill('<text:p text:style-name="Standard"/>').join('\n');
    case 'pagebreak': return `<text:p text:style-name="Standard"><text:soft-page-break/></text:p>`;
    case 'columns': return (block.content||[]).map(b=>_processOdtBlock(b,theme,imgs)).join('\n');
    default: return '';
  }
}

function _odtContent(spec,imgs) {
  const theme=spec.theme||{}, parts=[];
  if(spec.cover) {
    const font=theme.font||'Arial', accent='#'+(spec.cover.accentColor||theme.accentColor||'2E75B6').replace('#','');
    for(let i=0;i<8;i++) parts.push('<text:p text:style-name="Standard"/>');
    parts.push(`<text:p text:style-name="Standard" fo:text-align="center"><text:span fo:font-size="36pt" fo:font-weight="bold" fo:color="${accent}">${esc(spec.cover.title||'')}</text:span></text:p>`);
    if(spec.cover.subtitle) parts.push(`<text:p text:style-name="Standard" fo:text-align="center"><text:span fo:font-size="18pt" fo:color="#555555">${esc(spec.cover.subtitle)}</text:span></text:p>`);
    for(let i=0;i<8;i++) parts.push('<text:p text:style-name="Standard"/>');
    if(spec.cover.author) parts.push(`<text:p text:style-name="Standard" fo:text-align="center"><text:span fo:font-size="14pt" fo:font-weight="bold">${esc(spec.cover.author)}</text:span></text:p>`);
    if(spec.cover.date)   parts.push(`<text:p text:style-name="Standard" fo:text-align="center"><text:span fo:font-size="12pt" fo:color="#888888">${esc(spec.cover.date)}</text:span></text:p>`);
    parts.push(`<text:p text:style-name="Standard"><text:soft-page-break/></text:p>`);
  }
  for(const block of (spec.body||[])) parts.push(_processOdtBlock(block,theme,imgs));
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0">
<office:body><office:text>${parts.join('\n')}</office:text></office:body>
</office:document-content>`;
}

export async function createOdt(spec, imgs={}) {
  const JSZip=await loadJSZip(), zip=new JSZip();
  const imgList=Object.values(imgs).map(i=>i.filename);
  zip.file('mimetype',ODT_MIME,{compression:'STORE'});
  zip.file('META-INF/manifest.xml',_odtManifest(imgList));
  zip.file('meta.xml',_odtMeta(spec));
  zip.file('styles.xml',_odtStyles(spec));
  zip.file('content.xml',_odtContent(spec,imgs));
  for(const [id,img] of Object.entries(imgs)) zip.file(`Pictures/${img.filename}`,img.data,{base64:true});
  const blob=await zip.generateAsync({type:'blob',mimeType:ODT_MIME,compression:'DEFLATE',compressionOptions:{level:6}});
  const filename=spec.meta?.filename?.replace(/\.docx$/,'.odt')||`${(spec.meta?.title||'document').replace(/\s+/g,'-').toLowerCase()}.odt`;
  return {blob,filename,size:blob.size};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §6  PPTX ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const PPTX_PALETTES=['2E75B6','7F77DD','1D9E75','BA7517','D85A30','E24B4A','2E75B6','7F77DD'];

function _pptxTheme(spec) {
  const t=spec.theme||{};
  return {titleFont:t.titleFont||'Calibri',bodyFont:t.bodyFont||'Calibri',accent:(t.accentColor||'2E75B6').replace('#',''),dark:(t.darkColor||'1F3864').replace('#',''),light:'FFFFFF',bg:(t.bgColor||'FFFFFF').replace('#',''),fontSize:t.fontSize||14};
}

function _addSlide(prs,spec,theme,imgs) {
  const slide=prs.addSlide();
  const t=theme;
  switch(spec.type) {
    case 'title':
      slide.background={color:t.dark};
      slide.addText(spec.title||'',{x:0.5,y:1.8,w:9,h:1.6,fontSize:40,bold:true,color:t.light,fontFace:t.titleFont,align:'center'});
      if(spec.subtitle) slide.addText(spec.subtitle,{x:0.5,y:3.6,w:9,h:0.8,fontSize:20,color:'AAAAAA',fontFace:t.bodyFont,align:'center'});
      slide.addShape('rect',{x:3.5,y:3.3,w:3,h:0.04,fill:{color:t.accent},line:{type:'none'}});
      if(spec.author||spec.date) slide.addText([spec.author,spec.date].filter(Boolean).join('  ·  '),{x:0.5,y:4.6,w:9,h:0.4,fontSize:12,color:'888888',fontFace:t.bodyFont,align:'center'});
      break;
    case 'stats':
      slide.background={color:spec.bg||t.dark};
      slide.addText(spec.title||'',{x:0.4,y:0.2,w:9.2,h:0.6,fontSize:24,bold:true,color:t.light,fontFace:t.titleFont});
      (spec.stats||[]).slice(0,4).forEach((s,i)=>{
        const sw=9.2/Math.min((spec.stats||[]).length,4), sx=0.4+i*sw;
        slide.addText(s.value||'',{x:sx,y:1.4,w:sw-0.2,h:1.4,fontSize:54,bold:true,color:t.accent,fontFace:t.titleFont,align:'center'});
        slide.addText(s.label||'',{x:sx,y:2.9,w:sw-0.2,h:0.5,fontSize:14,color:'AAAAAA',fontFace:t.bodyFont,align:'center'});
        if(s.sub) slide.addText(s.sub,{x:sx,y:3.45,w:sw-0.2,h:0.4,fontSize:11,color:'777777',fontFace:t.bodyFont,align:'center',italic:true});
      });
      break;
    case 'quote':
      slide.background={color:spec.bg||t.dark};
      slide.addText('\u201C',{x:0.3,y:0.3,w:1.5,h:1.5,fontSize:96,color:t.accent,fontFace:t.titleFont});
      slide.addText(spec.quote||'',{x:0.8,y:1.0,w:8.5,h:2.8,fontSize:22,color:t.light,italic:true,fontFace:t.titleFont,align:'center',valign:'middle'});
      if(spec.attribution) slide.addText('— '+spec.attribution,{x:0.5,y:4.0,w:9,h:0.5,fontSize:14,color:'AAAAAA',fontFace:t.bodyFont,align:'center'});
      break;
    case 'section':
      slide.background={color:spec.bg||'#'+t.accent};
      slide.addText(spec.title||'',{x:0.5,y:1.8,w:9,h:1.4,fontSize:36,bold:true,color:'FFFFFF',fontFace:t.titleFont,align:'center'});
      if(spec.sub) slide.addText(spec.sub,{x:0.5,y:3.3,w:9,h:0.6,fontSize:16,color:'FFFFFFAA',fontFace:t.bodyFont,align:'center'});
      break;
    case 'chart':
      slide.background={color:spec.bg||t.bg};
      slide.addText(spec.title||'',{x:0.4,y:0.2,w:9.2,h:0.7,fontSize:28,bold:true,color:t.dark,fontFace:t.titleFont});
      if((spec.datasets||[]).length) slide.addChart(spec.chartType||'bar',(spec.datasets||[]).map(ds=>({name:ds.label||'',labels:spec.labels||[],values:ds.data||[]})),{x:0.4,y:1.1,w:9.2,h:4.2,showLegend:(spec.datasets||[]).length>1,showTitle:false,chartColors:(spec.datasets||[]).map((d,i)=>(d.color||PPTX_PALETTES[i]).replace('#',''))});
      break;
    case 'closing':
      slide.background={color:t.dark};
      slide.addText(spec.title||'Thank You',{x:0.5,y:1.5,w:9,h:1.5,fontSize:44,bold:true,color:t.light,fontFace:t.titleFont,align:'center'});
      if(spec.subtitle) slide.addText(spec.subtitle,{x:0.5,y:3.1,w:9,h:0.6,fontSize:18,color:'AAAAAA',fontFace:t.bodyFont,align:'center'});
      if(spec.contact)  slide.addText(spec.contact,{x:0.5,y:4.0,w:9,h:0.5,fontSize:14,color:'888888',fontFace:t.bodyFont,align:'center'});
      break;
    case 'two-col':
      slide.background={color:spec.bg||t.bg};
      slide.addText(spec.title||'',{x:0.4,y:0.2,w:9.2,h:0.7,fontSize:28,bold:true,color:t.dark,fontFace:t.titleFont});
      if(spec.left)  _addSlideContent(slide,spec.left,t,1.1,0.4,4.3);
      slide.addShape('line',{x:4.9,y:1.1,w:0,h:3.8,line:{color:'DDDDDD',width:1}});
      if(spec.right) _addSlideContent(slide,spec.right,t,1.1,5.1,4.3);
      break;
    default: // 'content'
      slide.background={color:spec.bg||t.bg};
      slide.addText(spec.title||'',{x:0.4,y:0.2,w:9.2,h:0.7,fontSize:28,bold:true,color:t.dark,fontFace:t.titleFont});
      if(spec.subtitle) slide.addText(spec.subtitle,{x:0.4,y:0.85,w:9.2,h:0.35,fontSize:13,color:t.accent,fontFace:t.bodyFont,italic:true});
      if(spec.content)  _addSlideContent(slide,spec.content,t,spec.subtitle?1.3:1.1);
      break;
  }
  if(spec.notes) slide.addNotes(spec.notes);
}

function _addSlideContent(slide,content,t,y=1.1,x=0.4,w=9.2) {
  if(typeof content==='string') { slide.addText(content,{x,y,w,h:4.0,fontSize:t.fontSize,color:'333333',fontFace:t.bodyFont}); return; }
  if(Array.isArray(content)) { slide.addText(content.map(item=>({text:typeof item==='string'?item:item.text,options:{bullet:{type:'bullet'},fontSize:t.fontSize,color:'333333',fontFace:t.bodyFont,breakLine:true}})),{x,y,w,h:4.0,valign:'top'}); }
}

export async function createPptx(spec,imgs={}) {
  const PptxGenJS=await loadPptxGen(), prs=new PptxGenJS(), theme=_pptxTheme(spec);
  prs.author=spec.meta?.author||'AETHER'; prs.title=spec.meta?.title||'Presentation'; prs.subject=spec.meta?.subject||'';
  for(const sl of (spec.slides||[])) _addSlide(prs,sl,theme,imgs);
  const buffer=await prs.write({outputType:'arraybuffer'});
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
  const filename=spec.meta?.filename||`${(spec.meta?.title||'presentation').replace(/\s+/g,'-').toLowerCase()}.pptx`;
  return {blob,filename,size:blob.size};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §7  XLSX ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function _colLetter(n){let s='';while(n>=0){s=String.fromCharCode((n%26)+65)+s;n=Math.floor(n/26)-1;}return s;}
function _cellRef(col,row){return `${_colLetter(col)}${row+1}`;}

function _buildDataSheet(XLSX,sheet) {
  const ws={}, cols=sheet.columns||[], rows=sheet.rows||[];
  const accent=(sheet.headerColor||'2E75B6').replace('#','');
  cols.forEach((col,ci)=>{
    const ref=_cellRef(ci,0);
    ws[ref]={v:col.header||col,t:'s',s:{font:{bold:true,color:{rgb:'FFFFFF'},name:'Arial'},fill:{fgColor:{rgb:accent}},alignment:{horizontal:'center',vertical:'center'},border:{bottom:{style:'thin',color:{rgb:'CCCCCC'}},right:{style:'thin',color:{rgb:'CCCCCC'}}}}};
  });
  rows.forEach((row,ri)=>{
    const cells=Array.isArray(row)?row:cols.map(c=>row[c.key||c.header||c]??'');
    cells.forEach((val,ci)=>{
      const ref=_cellRef(ci,ri+1);
      const isNum=typeof val==='number'||(!isNaN(val)&&val!=='');
      const isFormula=typeof val==='string'&&val.startsWith('=');
      const cell={s:{fill:sheet.striped&&ri%2===1?{fgColor:{rgb:'F5F5F5'}}:{fgColor:{rgb:'FFFFFF'}},alignment:{vertical:'center'},border:{bottom:{style:'hair',color:{rgb:'EEEEEE'}},right:{style:'hair',color:{rgb:'EEEEEE'}}},font:{name:'Arial',sz:11}}};
      if(isFormula){cell.f=val.slice(1);cell.t='n';}
      else if(isNum&&val!==''){cell.v=Number(val);cell.t='n';if(cols[ci]?.format)cell.z=cols[ci].format;}
      else{cell.v=String(val??'');cell.t='s';}
      ws[ref]=cell;
    });
  });
  if(sheet.totals) {
    const tr=rows.length+1;
    cols.forEach((col,ci)=>{
      const ref=_cellRef(ci,tr);
      if(ci===0) ws[ref]={v:'Total',t:'s',s:{font:{bold:true,name:'Arial'}}};
      else if(col.total!==false&&typeof(rows[0]?.[ci]??rows[0]?.[col.key])==='number') ws[ref]={f:`SUM(${_cellRef(ci,1)}:${_cellRef(ci,rows.length)})`,t:'n',s:{font:{bold:true,name:'Arial'},fill:{fgColor:{rgb:'EEF2FF'}}}};
    });
  }
  ws['!ref']=`A1:${_cellRef(Math.max(cols.length-1,0),rows.length+(sheet.totals?1:0))}`;
  ws['!cols']=cols.map(c=>typeof c==='object'&&c.width?{wch:c.width}:{wch:18});
  ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2'};
  return ws;
}

function _buildSummarySheet(XLSX,sheet) {
  const ws={}; let row=0;
  for(const block of (sheet.blocks||[])) {
    if(block.type==='title') { ws[_cellRef(0,row)]={v:block.text,t:'s',s:{font:{bold:true,sz:16,name:'Arial',color:{rgb:(block.color||'1F3864').replace('#','')}}}}; row+=2; }
    else if(block.type==='kv') { for(const [k,v] of Object.entries(block.data||{})) { ws[_cellRef(0,row)]={v:k,t:'s',s:{font:{bold:true,name:'Arial',sz:11}}}; ws[_cellRef(1,row)]={v:v,t:typeof v==='number'?'n':'s',s:{font:{name:'Arial',sz:11}}}; row++; } row++; }
    else if(block.type==='heading') { ws[_cellRef(0,row)]={v:block.text,t:'s',s:{font:{bold:true,sz:13,name:'Arial',color:{rgb:'2E75B6'}}}}; row+=2; }
    else if(block.type==='paragraph') { ws[_cellRef(0,row)]={v:block.text,t:'s',s:{font:{name:'Arial',sz:11},alignment:{wrapText:true}}}; row+=2; }
  }
  ws['!ref']=`A1:${_cellRef(5,row+1)}`; ws['!cols']=[{wch:24},{wch:40},{wch:20},{wch:20}];
  return ws;
}

export async function createXlsx(spec) {
  const XLSX=await loadXLSX(), wb=XLSX.utils.book_new();
  wb.Props={Title:spec.meta?.title||'Workbook',Author:spec.meta?.author||'AETHER',CreatedDate:new Date()};
  for(const sheet of (spec.sheets||[])) {
    const ws=sheet.type==='summary'?_buildSummarySheet(XLSX,sheet):_buildDataSheet(XLSX,sheet);
    XLSX.utils.book_append_sheet(wb,ws,sheet.name||'Sheet');
  }
  const buffer=XLSX.write(wb,{bookType:'xlsx',type:'array',cellStyles:true});
  const blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const filename=spec.meta?.filename||`${(spec.meta?.title||'workbook').replace(/\s+/g,'-').toLowerCase()}.xlsx`;
  return {blob,filename,size:blob.size};
}

export async function readXlsx(file) {
  const XLSX=await loadXLSX(), ab=await file.arrayBuffer(), wb=XLSX.read(ab,{type:'array',cellStyles:true,cellDates:true});
  const sheets=wb.SheetNames.map(name=>{ const ws=wb.Sheets[name],data=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); return {name,headers:data[0]||[],rows:data.slice(1),rowCount:data.length-1,colCount:(data[0]||[]).length}; });
  return {sheets,sheetCount:sheets.length,filename:file.name,size:file.size};
}

// ═══════════════════════════════════════════════════════════════════════════════
// §8  SQL ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export async function createDatabase(spec) {
  const SQL=await loadSQL(), db=new SQL.Database();
  for(const table of (spec.tables||[])) {
    const colDefs=table.columns.map(c=>{const p=[`"${c.name}" ${c.type||'TEXT'}`];if(c.primaryKey)p.push('PRIMARY KEY');if(c.autoIncrement)p.push('AUTOINCREMENT');if(c.notNull)p.push('NOT NULL');if(c.unique)p.push('UNIQUE');if(c.default!==undefined)p.push(`DEFAULT ${typeof c.default==='string'?`'${c.default}'`:c.default}`);return p.join(' ');}).join(', ');
    const fkDefs=(table.foreignKeys||[]).map(fk=>`FOREIGN KEY ("${fk.column}") REFERENCES "${fk.references}" ("${fk.on}")`).join(', ');
    db.run(`CREATE TABLE IF NOT EXISTS "${table.name}" (${[colDefs,fkDefs].filter(Boolean).join(', ')});`);
    if(table.rows?.length) {
      const nonAuto=table.columns.filter(c=>!c.autoIncrement);
      const stmt=db.prepare(`INSERT INTO "${table.name}" (${nonAuto.map(c=>`"${c.name}"`).join(',')}) VALUES (${nonAuto.map(()=>'?').join(',')});`);
      for(const row of table.rows) stmt.run(nonAuto.map(c=>row[c.name]??null));
      stmt.free();
    }
    for(const idx of (table.indexes||[])) db.run(`CREATE ${idx.unique?'UNIQUE ':''}INDEX IF NOT EXISTS "${idx.name}" ON "${table.name}" (${idx.columns.map(c=>`"${c}"`).join(',')});`);
  }
  for(const sql of (spec.sql||[])) { try{db.run(sql);}catch(e){console.warn('[AETHER SQL]',e.message);} }
  const data=db.export(), blob=new Blob([data],{type:'application/x-sqlite3'});
  const filename=spec.meta?.filename||`${(spec.meta?.title||'database').replace(/\s+/g,'-').toLowerCase()}.db`;
  const schema=(db.exec(`SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;`)[0]?.values||[]).map(([n,s])=>({name:n,sql:s}));
  const csvExports=(spec.tables||[]).map(table=>{ try{ const r=db.exec(`SELECT * FROM "${table.name}";`); if(!r.length) return {name:table.name,csv:'',filename:`${table.name}.csv`}; const {columns,values}=r[0]; const rows=[columns.join(','),...values.map(row=>row.map(v=>{if(v===null)return'';const s=String(v);return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`:s;}).join(','))]; return {name:table.name,csv:rows.join('\n'),filename:`${table.name}.csv`,rowCount:values.length}; }catch(e){return {name:table.name,csv:'',filename:`${table.name}.csv`,error:e.message};} });
  db.close();
  return {blob,filename,size:blob.size,csvExports,schema};
}

export async function readDatabase(file) {
  const SQL=await loadSQL(), buf=await file.arrayBuffer(), db=new SQL.Database(new Uint8Array(buf));
  const schema=(db.exec(`SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;`)[0]?.values||[]).map(([n,s])=>({name:n,sql:s}));
  const tables=schema.map(({name})=>{ try{ const r=db.exec(`SELECT * FROM "${name}" LIMIT 100;`); const cnt=db.exec(`SELECT COUNT(*) FROM "${name}";`); return {name,columns:r[0]?.columns||[],preview:r[0]?.values||[],rowCount:cnt[0]?.values[0]?.[0]??0}; }catch{ return {name,columns:[],preview:[],rowCount:0}; } });
  db.close();
  return {tables,tableCount:tables.length,schema,filename:file.name,size:file.size};
}

export function downloadCsv(csv,filename) {
  downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8;'}),filename);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §9  TEMPLATE LIBRARY  (28 templates)
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  // ── DOCUMENTS ─────────────────────────────────────────────────────────────
  'business-report':{id:'business-report',name:'Business Report',format:'docx',tags:['business','report'],spec:{type:'document',format:'docx',meta:{title:'{{TITLE}}',author:'{{AUTHOR}}',filename:'business-report.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'2E75B6'},cover:{title:'{{TITLE}}',subtitle:'{{SUBTITLE}}',author:'{{AUTHOR}}',date:'{{DATE}}',accentColor:'2E75B6'},header:{left:'{{COMPANY}}',right:'Confidential'},footer:{left:'© {{YEAR}} {{COMPANY}}',showPageNumber:true},body:[{block:'heading',level:1,text:'Executive Summary'},{block:'paragraph',text:'{{EXECUTIVE_SUMMARY}}'},{block:'callout',style:'info',text:'{{KEY_FINDING}}'},{block:'heading',level:1,text:'Analysis'},{block:'paragraph',text:'{{ANALYSIS}}'},{block:'heading',level:1,text:'Key Findings'},{block:'list',style:'bullet',items:['{{FINDING_1}}','{{FINDING_2}}','{{FINDING_3}}']},{block:'heading',level:1,text:'Recommendations'},{block:'list',style:'number',items:['{{RECOMMENDATION_1}}','{{RECOMMENDATION_2}}','{{RECOMMENDATION_3}}']},{block:'heading',level:1,text:'Conclusion'},{block:'paragraph',text:'{{CONCLUSION}}'}]}},
  'legal-contract':{id:'legal-contract',name:'Legal Contract',format:'docx',tags:['legal','contract'],spec:{type:'document',format:'docx',meta:{title:'{{CONTRACT_TITLE}}',filename:'contract.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Times New Roman',fontSize:12,accentColor:'2C3E50'},body:[{block:'heading',level:1,text:'{{CONTRACT_TITLE}}'},{block:'paragraph',text:'This Agreement is entered into as of {{DATE}} between {{PARTY_A}} and {{PARTY_B}}.'},{block:'heading',level:2,text:'1. Definitions'},{block:'paragraph',text:'{{DEFINITIONS}}'},{block:'heading',level:2,text:'2. Scope'},{block:'paragraph',text:'{{SCOPE}}'},{block:'heading',level:2,text:'3. Terms'},{block:'paragraph',text:'{{TERMS}}'},{block:'heading',level:2,text:'4. Payment'},{block:'paragraph',text:'{{PAYMENT_TERMS}}'},{block:'heading',level:2,text:'5. Confidentiality'},{block:'paragraph',text:'{{CONFIDENTIALITY}}'},{block:'heading',level:2,text:'6. Termination'},{block:'paragraph',text:'{{TERMINATION}}'},{block:'heading',level:2,text:'7. Signatures'},{block:'spacer',lines:2},{block:'paragraph',text:'{{PARTY_A}}: _______________________________   Date: __________'},{block:'spacer',lines:1},{block:'paragraph',text:'{{PARTY_B}}: _______________________________   Date: __________'}]}},
  'project-proposal':{id:'project-proposal',name:'Project Proposal',format:'docx',tags:['proposal','project'],spec:{type:'document',format:'docx',meta:{title:'{{PROJECT_NAME}} — Proposal',filename:'proposal.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'1D9E75'},cover:{title:'{{PROJECT_NAME}}',subtitle:'Project Proposal',author:'{{AUTHOR}}',date:'{{DATE}}',accentColor:'1D9E75'},footer:{left:'{{COMPANY}}',showPageNumber:true},body:[{block:'heading',level:1,text:'Overview'},{block:'paragraph',text:'{{OVERVIEW}}'},{block:'heading',level:1,text:'Objectives'},{block:'list',style:'bullet',items:['{{OBJECTIVE_1}}','{{OBJECTIVE_2}}','{{OBJECTIVE_3}}']},{block:'heading',level:1,text:'Timeline'},{block:'table',headers:['Phase','Deliverable','Duration','Due'],rows:[['{{PHASE_1}}','{{DEL_1}}','{{DUR_1}}','{{DATE_1}}'],['{{PHASE_2}}','{{DEL_2}}','{{DUR_2}}','{{DATE_2}}']],headerColor:'1D9E75',striped:true,widths:[20,40,20,20]},{block:'heading',level:1,text:'Budget'},{block:'table',headers:['Item','Cost'],rows:[['{{ITEM_1}}','{{COST_1}}'],['Total','{{TOTAL}}']],headerColor:'1D9E75',widths:[70,30]},{block:'heading',level:1,text:'Next Steps'},{block:'list',style:'number',items:['{{STEP_1}}','{{STEP_2}}','{{STEP_3}}']}]}},
  'meeting-minutes':{id:'meeting-minutes',name:'Meeting Minutes',format:'docx',tags:['meeting','minutes'],spec:{type:'document',format:'docx',meta:{title:'Meeting Minutes — {{MEETING_TITLE}}',filename:'meeting-minutes.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'7F77DD'},header:{left:'Meeting Minutes',right:'{{DATE}}'},footer:{left:'{{COMPANY}}',showPageNumber:true},body:[{block:'heading',level:1,text:'{{MEETING_TITLE}}'},{block:'table',headers:['Detail','Info'],rows:[['Date','{{DATE}}'],['Time','{{TIME}}'],['Location','{{LOCATION}}'],['Facilitator','{{FACILITATOR}}']],headerColor:'7F77DD',widths:[30,70]},{block:'heading',level:2,text:'Attendees'},{block:'list',style:'bullet',items:['{{ATTENDEE_1}}','{{ATTENDEE_2}}','{{ATTENDEE_3}}']},{block:'heading',level:2,text:'Discussion'},{block:'paragraph',text:'{{DISCUSSION}}'},{block:'heading',level:2,text:'Decisions'},{block:'list',style:'bullet',items:['{{DECISION_1}}','{{DECISION_2}}']},{block:'heading',level:2,text:'Action Items'},{block:'table',headers:['Action','Owner','Due','Status'],rows:[['{{ACTION_1}}','{{OWNER_1}}','{{DUE_1}}','Pending'],['{{ACTION_2}}','{{OWNER_2}}','{{DUE_2}}','Pending']],headerColor:'7F77DD',striped:true,widths:[45,20,20,15]}]}},
  'invoice':{id:'invoice',name:'Invoice',format:'docx',tags:['invoice','billing'],spec:{type:'document',format:'docx',meta:{title:'Invoice #{{INVOICE_NUMBER}}',filename:'invoice.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'2C5F2D'},body:[{block:'heading',level:1,text:'INVOICE'},{block:'table',headers:['Invoice #','Date','Due','Status'],rows:[['{{INVOICE_NUMBER}}','{{DATE}}','{{DUE_DATE}}','{{STATUS}}']],headerColor:'2C5F2D',widths:[25,25,25,25]},{block:'spacer',lines:1},{block:'table',headers:['Description','Qty','Unit Price','Total'],rows:[['{{ITEM_1}}','{{QTY_1}}','{{PRICE_1}}','{{TOTAL_1}}'],['{{ITEM_2}}','{{QTY_2}}','{{PRICE_2}}','{{TOTAL_2}}'],['','','Subtotal','{{SUBTOTAL}}'],['','','Tax','{{TAX}}'],['','','TOTAL','{{GRAND_TOTAL}}']],headerColor:'2C5F2D',widths:[50,15,20,15]},{block:'spacer',lines:1},{block:'paragraph',text:'Payment terms: {{PAYMENT_TERMS}}'},{block:'callout',style:'info',text:'Payment methods: {{PAYMENT_METHODS}}'}]}},
  'cover-letter':{id:'cover-letter',name:'Cover Letter',format:'docx',tags:['letter','job'],spec:{type:'document',format:'docx',meta:{title:'Cover Letter',filename:'cover-letter.docx'},page:{size:'letter',margins:{top:1.2,bottom:1.2,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'2E75B6'},body:[{block:'paragraph',align:'right',text:'{{APPLICANT_NAME}}'},{block:'paragraph',align:'right',text:'{{DATE}}'},{block:'spacer',lines:1},{block:'paragraph',text:'Dear {{HIRING_MANAGER}},'},{block:'spacer',lines:1},{block:'paragraph',text:'{{OPENING}}'},{block:'spacer',lines:1},{block:'paragraph',text:'{{BODY_1}}'},{block:'spacer',lines:1},{block:'paragraph',text:'{{BODY_2}}'},{block:'spacer',lines:1},{block:'paragraph',text:'{{CLOSING}}'},{block:'spacer',lines:1},{block:'paragraph',text:'Sincerely,'},{block:'spacer',lines:2},{block:'paragraph',runs:[{text:'{{APPLICANT_NAME}}',bold:true}]}]}},
  'nda':{id:'nda',name:'NDA',format:'docx',tags:['legal','nda'],spec:{type:'document',format:'docx',meta:{title:'Non-Disclosure Agreement',filename:'nda.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Times New Roman',fontSize:12,accentColor:'2C3E50'},body:[{block:'heading',level:1,text:'NON-DISCLOSURE AGREEMENT'},{block:'paragraph',text:'This NDA is entered into as of {{DATE}} between {{PARTY_A}} and {{PARTY_B}}.'},{block:'heading',level:2,text:'1. Confidential Information'},{block:'paragraph',text:'{{CONFIDENTIAL_INFO}}'},{block:'heading',level:2,text:'2. Obligations'},{block:'paragraph',text:'{{OBLIGATIONS}}'},{block:'heading',level:2,text:'3. Term'},{block:'paragraph',text:'{{TERM}}'},{block:'heading',level:2,text:'4. Signatures'},{block:'spacer',lines:1},{block:'paragraph',text:'{{PARTY_A}}: ___________________________   Date: __________'},{block:'spacer',lines:1},{block:'paragraph',text:'{{PARTY_B}}: ___________________________   Date: __________'}]}},
  'technical-spec':{id:'technical-spec',name:'Technical Specification',format:'docx',tags:['technical','engineering'],spec:{type:'document',format:'docx',meta:{title:'{{SYSTEM_NAME}} — Tech Spec',filename:'tech-spec.docx'},page:{size:'letter',margins:{top:1,bottom:1,left:1.25,right:1.25}},theme:{font:'Arial',fontSize:12,accentColor:'36454F'},cover:{title:'{{SYSTEM_NAME}}',subtitle:'Technical Specification',author:'{{AUTHOR}}',date:'{{DATE}}',accentColor:'36454F'},footer:{showPageNumber:true},body:[{block:'heading',level:1,text:'1. Overview'},{block:'paragraph',text:'{{OVERVIEW}}'},{block:'heading',level:1,text:'2. Goals'},{block:'list',style:'bullet',items:['{{GOAL_1}}','{{GOAL_2}}']},{block:'heading',level:1,text:'3. Architecture'},{block:'paragraph',text:'{{ARCHITECTURE}}'},{block:'callout',style:'info',text:'{{KEY_DECISION}}'},{block:'heading',level:1,text:'4. Data Model'},{block:'paragraph',text:'{{DATA_MODEL}}'},{block:'heading',level:1,text:'5. Security'},{block:'paragraph',text:'{{SECURITY}}'},{block:'callout',style:'warning',text:'{{SECURITY_WARNING}}'},{block:'heading',level:1,text:'6. Open Questions'},{block:'list',style:'bullet',items:['{{QUESTION_1}}','{{QUESTION_2}}']}]}},
  // ── PRESENTATIONS ─────────────────────────────────────────────────────────
  'pitch-deck':{id:'pitch-deck',name:'Pitch Deck',format:'pptx',tags:['pitch','startup'],spec:{type:'presentation',format:'pptx',meta:{title:'{{COMPANY_NAME}}',filename:'pitch-deck.pptx'},theme:{accentColor:'{{ACCENT}}',darkColor:'{{DARK}}'},slides:[{type:'title',title:'{{COMPANY_NAME}}',subtitle:'{{TAGLINE}}'},{type:'content',title:'The Problem',content:['{{PROBLEM_1}}','{{PROBLEM_2}}','{{PROBLEM_3}}']},{type:'content',title:'Our Solution',content:'{{SOLUTION}}'},{type:'stats',title:'Market Opportunity',stats:[{value:'{{TAM}}',label:'TAM'},{value:'{{SAM}}',label:'SAM'},{value:'{{SOM}}',label:'SOM'}]},{type:'two-col',title:'Why Us',left:['{{ADVANTAGE_1}}','{{ADVANTAGE_2}}'],right:'{{LANDSCAPE}}'},{type:'stats',title:'Traction',stats:[{value:'{{METRIC_1}}',label:'{{LABEL_1}}'},{value:'{{METRIC_2}}',label:'{{LABEL_2}}'},{value:'{{METRIC_3}}',label:'{{LABEL_3}}'}]},{type:'content',title:'Business Model',content:'{{BIZ_MODEL}}'},{type:'content',title:'The Team',content:'{{TEAM}}'},{type:'stats',title:'The Ask',stats:[{value:'{{RAISE}}',label:'Raising'},{value:'{{USE_1}}',label:'{{USE_1_LABEL}}'},{value:'{{USE_2}}',label:'{{USE_2_LABEL}}'}]},{type:'closing',title:"Let's Build Together",contact:'{{EMAIL}}'}]}},
  'project-update':{id:'project-update',name:'Project Status Update',format:'pptx',tags:['project','status'],spec:{type:'presentation',format:'pptx',meta:{title:'{{PROJECT}} — Status',filename:'project-update.pptx'},theme:{accentColor:'2E75B6',darkColor:'1F3864'},slides:[{type:'title',title:'{{PROJECT}}',subtitle:'Status Update — {{DATE}}'},{type:'stats',title:'At a Glance',stats:[{value:'{{PCT}}%',label:'Complete'},{value:'{{DAYS}}',label:'Days Left'},{value:'{{STATUS}}',label:'Health'}]},{type:'content',title:'Wins This Period',content:['{{WIN_1}}','{{WIN_2}}','{{WIN_3}}']},{type:'content',title:'Risks',content:['{{RISK_1}}','{{RISK_2}}']},{type:'content',title:'Next Period',content:['{{NEXT_1}}','{{NEXT_2}}','{{NEXT_3}}']},{type:'closing',title:'Questions?',contact:'{{PM}}'}]}},
  'training-deck':{id:'training-deck',name:'Training Deck',format:'pptx',tags:['training','education'],spec:{type:'presentation',format:'pptx',meta:{title:'{{TITLE}}',filename:'training.pptx'},theme:{accentColor:'1D9E75',darkColor:'0A4D36'},slides:[{type:'title',title:'{{TITLE}}',subtitle:'{{TRAINER}} | {{DATE}}'},{type:'content',title:'Objectives',content:['{{OBJECTIVE_1}}','{{OBJECTIVE_2}}','{{OBJECTIVE_3}}']},{type:'section',title:'{{SECTION_1}}'},{type:'content',title:'{{SECTION_1}}',content:['{{POINT_1}}','{{POINT_2}}','{{POINT_3}}']},{type:'section',title:'{{SECTION_2}}'},{type:'content',title:'{{SECTION_2}}',content:['{{POINT_4}}','{{POINT_5}}','{{POINT_6}}']},{type:'content',title:'Key Takeaways',content:['{{TAKEAWAY_1}}','{{TAKEAWAY_2}}']},{type:'closing',title:'Questions?',contact:'{{CONTACT}}'}]}},
  // ── SPREADSHEETS ──────────────────────────────────────────────────────────
  'budget-tracker':{id:'budget-tracker',name:'Budget Tracker',format:'xlsx',tags:['budget','finance'],spec:{type:'spreadsheet',format:'xlsx',meta:{title:'{{YEAR}} Budget',filename:'budget.xlsx'},sheets:[{name:'Income',type:'data',headerColor:'2C5F2D',striped:true,columns:[{header:'Category',key:'category',width:24},{header:'Monthly',key:'monthly',width:16,format:'$#,##0.00'},{header:'Annual',key:'annual',width:16,format:'$#,##0.00'}],rows:[{category:'{{INCOME_1}}',monthly:'{{AMT_1}}',annual:'={{AMT_1}}*12'},{category:'{{INCOME_2}}',monthly:'{{AMT_2}}',annual:'={{AMT_2}}*12'}],totals:true},{name:'Expenses',type:'data',headerColor:'B85042',striped:true,columns:[{header:'Category',key:'category',width:24},{header:'Budget',key:'budget',width:14,format:'$#,##0.00'},{header:'Actual',key:'actual',width:14,format:'$#,##0.00'}],rows:[{category:'Housing',budget:'{{HOUSING}}',actual:''},{category:'Food',budget:'{{FOOD}}',actual:''},{category:'Transport',budget:'{{TRANSPORT}}',actual:''}],totals:true}]}},
  'project-tracker':{id:'project-tracker',name:'Project Tracker',format:'xlsx',tags:['project','tasks'],spec:{type:'spreadsheet',format:'xlsx',meta:{title:'{{PROJECT}} Tracker',filename:'project-tracker.xlsx'},sheets:[{name:'Tasks',type:'data',headerColor:'2E75B6',striped:true,columns:[{header:'ID',key:'id',width:6},{header:'Task',key:'task',width:36},{header:'Owner',key:'owner',width:18},{header:'Status',key:'status',width:14},{header:'Priority',key:'priority',width:12},{header:'Due',key:'due',width:14},{header:'% Done',key:'pct',width:12,format:'0%'}],rows:[{id:1,task:'{{TASK_1}}',owner:'{{OWNER_1}}',status:'In Progress',priority:'High',due:'{{DUE_1}}',pct:0.3},{id:2,task:'{{TASK_2}}',owner:'{{OWNER_2}}',status:'Todo',priority:'Medium',due:'{{DUE_2}}',pct:0}]}]}},
  'invoice-tracker':{id:'invoice-tracker',name:'Invoice Tracker',format:'xlsx',tags:['invoice','billing'],spec:{type:'spreadsheet',format:'xlsx',meta:{title:'Invoice Tracker {{YEAR}}',filename:'invoices.xlsx'},sheets:[{name:'Invoices',type:'data',headerColor:'2C5F2D',striped:true,columns:[{header:'Invoice #',key:'num',width:14},{header:'Client',key:'client',width:24},{header:'Amount',key:'amount',width:14,format:'$#,##0.00'},{header:'Issued',key:'issued',width:14},{header:'Due',key:'due',width:14},{header:'Status',key:'status',width:14}],rows:[{num:'INV-001',client:'{{CLIENT_1}}',amount:'{{AMT_1}}',issued:'{{ISSUED_1}}',due:'{{DUE_1}}',status:'Outstanding'}],totals:true}]}},
  // ── DATABASES ─────────────────────────────────────────────────────────────
  'crm':{id:'crm',name:'CRM Database',format:'sql',tags:['crm','customers'],spec:{type:'database',format:'sql',meta:{title:'{{COMPANY}} CRM',filename:'crm.db'},tables:[{name:'contacts',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'first_name',type:'TEXT',notNull:true},{name:'last_name',type:'TEXT',notNull:true},{name:'email',type:'TEXT',unique:true},{name:'phone',type:'TEXT'},{name:'company',type:'TEXT'},{name:'status',type:'TEXT',default:'lead'},{name:'created_at',type:'DATETIME',default:'CURRENT_TIMESTAMP'}],rows:[{first_name:'{{FIRST_1}}',last_name:'{{LAST_1}}',email:'{{EMAIL_1}}',company:'{{COMPANY_1}}',status:'customer'}],indexes:[{name:'idx_contacts_email',columns:['email'],unique:true}]},{name:'deals',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'contact_id',type:'INTEGER',notNull:true},{name:'title',type:'TEXT',notNull:true},{name:'value',type:'REAL'},{name:'stage',type:'TEXT',default:'prospecting'},{name:'close_date',type:'DATE'}],foreignKeys:[{column:'contact_id',references:'contacts',on:'id'}],rows:[]}],sql:['CREATE VIEW IF NOT EXISTS pipeline AS SELECT d.title,d.value,d.stage,c.first_name||" "||c.last_name AS contact FROM deals d JOIN contacts c ON d.contact_id=c.id;']}},
  'inventory':{id:'inventory',name:'Inventory Database',format:'sql',tags:['inventory','products'],spec:{type:'database',format:'sql',meta:{title:'{{COMPANY}} Inventory',filename:'inventory.db'},tables:[{name:'products',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'sku',type:'TEXT',notNull:true,unique:true},{name:'name',type:'TEXT',notNull:true},{name:'category',type:'TEXT'},{name:'unit_price',type:'REAL'},{name:'qty_on_hand',type:'INTEGER',default:0},{name:'reorder_pt',type:'INTEGER',default:10}],rows:[{sku:'{{SKU_1}}',name:'{{PRODUCT_1}}',category:'{{CAT_1}}',unit_price:'{{PRICE_1}}',qty_on_hand:'{{QTY_1}}',reorder_pt:5}],indexes:[{name:'idx_sku',columns:['sku'],unique:true}]},{name:'stock_movements',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'product_id',type:'INTEGER',notNull:true},{name:'type',type:'TEXT'},{name:'qty',type:'INTEGER',notNull:true},{name:'created_at',type:'DATETIME',default:'CURRENT_TIMESTAMP'}],foreignKeys:[{column:'product_id',references:'products',on:'id'}],rows:[]}],sql:['CREATE VIEW IF NOT EXISTS low_stock AS SELECT sku,name,qty_on_hand,reorder_pt FROM products WHERE qty_on_hand<=reorder_pt;']}},
  'task-tracker':{id:'task-tracker',name:'Task Tracker DB',format:'sql',tags:['tasks','project'],spec:{type:'database',format:'sql',meta:{title:'{{PROJECT}} Tasks',filename:'tasks.db'},tables:[{name:'projects',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'name',type:'TEXT',notNull:true},{name:'status',type:'TEXT',default:'active'},{name:'created_at',type:'DATETIME',default:'CURRENT_TIMESTAMP'}],rows:[{name:'{{PROJECT_1}}',status:'active'}]},{name:'tasks',columns:[{name:'id',type:'INTEGER',primaryKey:true,autoIncrement:true},{name:'project_id',type:'INTEGER'},{name:'title',type:'TEXT',notNull:true},{name:'assignee',type:'TEXT'},{name:'status',type:'TEXT',default:'todo'},{name:'priority',type:'TEXT',default:'medium'},{name:'due_date',type:'DATE'}],foreignKeys:[{column:'project_id',references:'projects',on:'id'}],rows:[{project_id:1,title:'{{TASK_1}}',assignee:'{{ASSIGNEE_1}}',status:'in_progress',priority:'high',due_date:'{{DUE_1}}'}],indexes:[{name:'idx_tasks_status',columns:['status']}]}]}},
};

export const getTemplate    = id  => TEMPLATES[id]||null;
export const searchTemplates= (q,fmt) => Object.values(TEMPLATES).filter(t=>(!fmt||t.format===fmt)&&(!q||t.name.toLowerCase().includes(q.toLowerCase())||t.tags.some(tag=>tag.includes(q.toLowerCase()))));
export function fillTemplate(id,vars) {
  const t=getTemplate(id); if(!t) throw new Error(`Template not found: ${id}`);
  return JSON.parse(JSON.stringify(t.spec).replace(/\{\{([A-Z0-9_]+)\}\}/g,(_,k)=>vars[k]!==undefined?String(vars[k]):_));
}

// ═══════════════════════════════════════════════════════════════════════════════
// §10  UI CARDS
// ═══════════════════════════════════════════════════════════════════════════════

const FMT_ICONS={docx:'📄',odt:'📝',pptx:'📊',xlsx:'📈',sql:'🗄️',csv:'📋',db:'🗄️'};

export function renderResultCard(result, container) {
  const ext=result.filename?.split('.').pop()||'file', icon=FMT_ICONS[ext]||'📄';
  container.innerHTML='';
  Object.assign(container.style,{fontFamily:'system-ui,sans-serif',border:'0.5px solid var(--color-border-tertiary,#e0e0e0)',borderRadius:'12px',padding:'16px 18px',background:'var(--color-background-secondary,#f9f9f9)',display:'flex',flexDirection:'column',gap:'12px'});
  const top=document.createElement('div'); top.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px';
  const info=document.createElement('div'); info.innerHTML=`<div style="font-size:13px;font-weight:500;margin-bottom:3px">${icon} ${result.filename}</div><div style="font-size:11px;color:var(--color-text-tertiary,#888)">${ext.toUpperCase()} · ${(result.size/1024).toFixed(1)} KB</div>`;
  const btn=document.createElement('button'); btn.textContent='Download'; Object.assign(btn.style,{fontSize:'12px',fontWeight:'500',padding:'7px 16px',borderRadius:'6px',border:'none',cursor:'pointer',whiteSpace:'nowrap',background:'var(--color-text-primary,#111)',color:'var(--color-background-primary,#fff)',fontFamily:'inherit'}); btn.onclick=()=>downloadBlob(result.blob,result.filename);
  top.appendChild(info); top.appendChild(btn); container.appendChild(top);
  if(result.csvExports?.length) {
    const sec=document.createElement('div'); sec.style.cssText='border-top:0.5px solid var(--color-border-tertiary,#e0e0e0);padding-top:10px';
    sec.innerHTML='<div style="font-size:10px;font-weight:500;color:var(--color-text-tertiary,#888);letter-spacing:.06em;margin-bottom:8px">CSV EXPORTS</div>';
    const row=document.createElement('div'); row.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    result.csvExports.filter(e=>e.csv).forEach(csv=>{ const b=document.createElement('button'); b.textContent=`${csv.name}.csv`; b.style.cssText='font-size:11px;padding:4px 10px;border-radius:5px;cursor:pointer;border:0.5px solid var(--color-border-secondary,#ccc);background:var(--color-background-primary,#fff);color:var(--color-text-secondary,#555);font-family:inherit'; b.onclick=()=>downloadCsv(csv.csv,csv.filename); row.appendChild(b); });
    sec.appendChild(row); container.appendChild(sec);
  }
}

export function renderReadCard(result, container) {
  const ext=result.filename?.split('.').pop()||'file', icon=FMT_ICONS[ext]||'📄';
  container.innerHTML=`<div style="font-family:system-ui;border:0.5px solid var(--color-border-tertiary,#e0e0e0);border-radius:12px;padding:16px 18px;background:var(--color-background-secondary,#f9f9f9)"><div style="font-size:13px;font-weight:500;margin-bottom:8px">${icon} ${result.filename}</div><div style="display:flex;gap:16px;font-size:11px;color:var(--color-text-tertiary,#888);flex-wrap:wrap">${result.wordCount!==undefined?`<span>${result.wordCount.toLocaleString()} words</span>`:''} ${result.headings?.length?`<span>${result.headings.length} headings</span>`:''} ${result.tableCount?`<span>${result.tableCount} tables</span>`:''} ${result.sheetCount!==undefined?`<span>${result.sheetCount} sheets</span>`:''}<span>${(result.size/1024).toFixed(1)} KB</span></div>${result.headings?.length?`<div style="margin-top:10px;font-size:11px;font-weight:500;color:var(--color-text-secondary,#555);margin-bottom:5px">STRUCTURE</div><div style="font-size:11px;color:var(--color-text-secondary,#555);line-height:1.8">${result.headings.slice(0,10).map(h=>`<div style="padding-left:${(h.level-1)*12}px">${'–'.repeat(h.level-1)} ${h.text}</div>`).join('')}${result.headings.length>10?`<div style="color:var(--color-text-tertiary,#aaa)">+${result.headings.length-10} more</div>`:''}</div>`:''}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// §11  REBUILD FLOW
// ═══════════════════════════════════════════════════════════════════════════════

export async function rebuild(file, instruction, apiKey, outputEl) {
  const ext=file.name.split('.').pop().toLowerCase();
  let readResult;
  if(ext==='docx') readResult=await readDocx(file);
  else if(ext==='xlsx') readResult=await readXlsx(file);
  else if(ext==='db') readResult=await readDatabase(file);
  else throw new Error(`Unsupported rebuild format: .${ext}`);

  let ctx=`Uploaded file: "${file.name}"\n\n`;
  if(readResult.text) ctx+=`TEXT:\n${readResult.text.slice(0,6000)}\n\n`;
  if(readResult.headings?.length) ctx+=`STRUCTURE:\n${readResult.headings.map(h=>`${'  '.repeat(h.level-1)}H${h.level}: ${h.text}`).join('\n')}\n\n`;
  if(readResult.tables?.length) ctx+=`SHEETS:\n${readResult.tables.map(t=>`- ${t.name}: ${t.rowCount} rows`).join('\n')}\n\n`;
  ctx+=`INSTRUCTION: ${instruction}\n\nOutput a complete new spec. Raw JSON only.`;

  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:4096,system:SYSTEM_PROMPT,messages:[{role:'user',content:ctx}]})});
  const data=await r.json(); if(data.error) throw new Error(data.error.message);
  const llmText=data.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  const spec=extractSpec(llmText); if(!spec) throw new Error('LLM did not return a valid spec');
  return execute(spec, outputEl);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §12  MAIN EXECUTE
// ═══════════════════════════════════════════════════════════════════════════════

export async function execute(input, outputEl) {
  if(input instanceof File) {
    const ext=input.name.split('.').pop().toLowerCase();
    let result;
    if(ext==='docx') result=await readDocx(input);
    else if(ext==='xlsx'||ext==='csv') result=await readXlsx(input);
    else if(ext==='db') result=await readDatabase(input);
    else throw new Error(`Unsupported read format: .${ext}`);
    result.filename=input.name; result.size=input.size;
    if(outputEl) renderReadCard(result,outputEl);
    return {type:'read',...result};
  }
  if(input?.type==='use-template') { const spec=fillTemplate(input.templateId,input.variables||{}); return execute(spec,outputEl); }
  if(input?.type==='document') { const imgs=imageRegistry.toObject(); const result=input.format==='odt'?await createOdt(input,imgs):await createDocx(input,imgs); if(outputEl) renderResultCard(result,outputEl); return {type:'created',...result}; }
  if(input?.type==='presentation') { const imgs=imageRegistry.toObject(); const result=await createPptx(input,imgs); if(outputEl) renderResultCard(result,outputEl); return {type:'created',...result}; }
  if(input?.type==='spreadsheet') { const result=await createXlsx(input); if(outputEl) renderResultCard(result,outputEl); return {type:'created',...result}; }
  if(input?.type==='database') { const result=await createDatabase(input); if(outputEl) renderResultCard(result,outputEl); return {type:'created',...result}; }
  throw new Error(`Unknown input type: ${input?.type}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// §13  SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

export const SYSTEM_PROMPT = `You are Documents Supremacy — the most advanced browser-native document engine.
Create, read, and rebuild professional documents in any format. No server required.

FORMATS: docx | odt | pptx | xlsx | sql

OUTPUT RULE: When creating a document respond ONLY with raw JSON. No fences. No explanation.

DOCUMENT (docx/odt): { "type":"document","format":"docx","meta":{"title":"...","author":"...","filename":"out.docx"},"page":{"size":"letter","orientation":"portrait","margins":{"top":1,"bottom":1,"left":1.25,"right":1.25}},"theme":{"font":"Arial","fontSize":12,"accentColor":"2E75B6"},"cover":{"title":"...","subtitle":"...","author":"...","date":"..."},"header":{"left":"...","right":"...","showPageNumber":false},"footer":{"left":"...","showPageNumber":true},"body":[{"block":"heading","level":1,"text":"..."},{"block":"paragraph","text":"..."},{"block":"paragraph","runs":[{"text":"bold","bold":true},{"text":" link","link":"https://..."},{"footnote":"footnote text"}]},{"block":"list","style":"bullet","items":["A","B"]},{"block":"list","style":"number","items":["1","2"]},{"block":"table","headers":["A","B"],"rows":[["1","2"]],"headerColor":"2E75B6","striped":true,"widths":[50,50]},{"block":"callout","style":"info","text":"..."},{"block":"divider"},{"block":"spacer","lines":1},{"block":"pagebreak"},{"block":"columns","count":2,"content":[{"block":"paragraph","text":"left"},{"block":"paragraph","text":"right"}]}]}

PRESENTATION (pptx): { "type":"presentation","format":"pptx","meta":{"title":"...","filename":"deck.pptx"},"theme":{"accentColor":"2E75B6","darkColor":"1F3864"},"slides":[{"type":"title","title":"...","subtitle":"..."},{"type":"content","title":"...","content":["bullet 1","bullet 2"]},{"type":"stats","title":"...","stats":[{"value":"94%","label":"Label"}]},{"type":"two-col","title":"...","left":["..."],"right":"..."},{"type":"quote","quote":"...","attribution":"..."},{"type":"section","title":"..."},{"type":"chart","title":"...","chartType":"bar","labels":["Q1","Q2"],"datasets":[{"label":"Rev","data":[100,120],"color":"2E75B6"}]},{"type":"closing","title":"Thanks","contact":"..."}]}

SPREADSHEET (xlsx): { "type":"spreadsheet","format":"xlsx","meta":{"title":"...","filename":"data.xlsx"},"sheets":[{"name":"Sheet1","type":"data","headerColor":"2E75B6","striped":true,"totals":true,"columns":[{"header":"Name","key":"name","width":24},{"header":"Amount","key":"amount","width":16,"format":"$#,##0.00"}],"rows":[{"name":"Row 1","amount":1250}]},{"name":"Summary","type":"summary","blocks":[{"type":"title","text":"Summary"},{"type":"kv","data":{"Total":"=SUM(Sheet1!B:B)"}}]}]}

DATABASE (sql): { "type":"database","format":"sql","meta":{"title":"...","filename":"data.db"},"tables":[{"name":"users","columns":[{"name":"id","type":"INTEGER","primaryKey":true,"autoIncrement":true},{"name":"name","type":"TEXT","notNull":true},{"name":"email","type":"TEXT","unique":true},{"name":"created_at","type":"DATETIME","default":"CURRENT_TIMESTAMP"}],"rows":[{"name":"Alice","email":"alice@example.com"}],"indexes":[{"name":"idx_email","columns":["email"],"unique":true}],"foreignKeys":[]}],"sql":["CREATE VIEW IF NOT EXISTS ..."]}

TEMPLATES (use-template): { "type":"use-template","templateId":"business-report","variables":{"TITLE":"...","AUTHOR":"...","DATE":"..."} }
Available: business-report | legal-contract | project-proposal | meeting-minutes | invoice | cover-letter | nda | technical-spec | pitch-deck | project-update | training-deck | budget-tracker | project-tracker | invoice-tracker | crm | inventory | task-tracker

RULES: Output only JSON. Never use \\n in text. Table widths[] must sum to 100. Always include meta.filename.`;

// ═══════════════════════════════════════════════════════════════════════════════
// §14  SKILL DEFINITION
// ═══════════════════════════════════════════════════════════════════════════════

const DocumentsSupremacy = {
  name:'documents-supremacy', version:'1.0.0',
  description:'Create, read, and rebuild Word, ODT, PowerPoint, Excel, and SQLite database files entirely in the browser',
  category:'documents', tier:'utility',
  formats:['docx','odt','pptx','xlsx','sql','csv','db'],
  templateCount:Object.keys(TEMPLATES).length,
  triggers:['word document','word doc','.docx','docx','write a report','create a report','write a memo','write a letter','draft a letter','write a contract','create a template','business report','professional document','formal document','.odt','odt','openDocument','libreoffice','presentation','slide deck','slides','pitch deck','.pptx','pptx','powerpoint','spreadsheet','excel','.xlsx','xlsx','budget','tracker','workbook','data table','financial model','database','sql','.db','sqlite','create a database','schema','summarize this document','read this file','analyze this file','extract text','rewrite this document','update this report','modify this file','rebuild this'],
  systemPrompt:SYSTEM_PROMPT,
  tools:{execute,rebuild,createDocx,readDocx,createOdt,createPptx,createXlsx,readXlsx,createDatabase,readDatabase,downloadCsv,imageRegistry,templates:{getTemplate,searchTemplates,fillTemplate,all:TEMPLATES}},
  ui:{renderResult:renderResultCard,renderRead:renderReadCard},
  execute, extractSpec, downloadBlob,
};

export default DocumentsSupremacy;
