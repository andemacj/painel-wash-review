/* W13-R1: local XLSX writer for the displayed 31-question matrix. No dependencies. */
(() => {
  'use strict';
  const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const xml=value=>{
    const text=String(value??'');
    if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text))throw new Error('Texto incompatível com a planilha.');
    return text.replace(/[&<>"'\r]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;'}[c]));
  };
  function utf8(value) {
    const bytes=[];
    for(const char of value){
      let n=char.codePointAt(0);if(n>=0xD800&&n<=0xDFFF)n=0xFFFD;
      if(n<0x80)bytes.push(n);
      else if(n<0x800)bytes.push(0xC0|(n>>6),0x80|(n&63));
      else if(n<0x10000)bytes.push(0xE0|(n>>12),0x80|((n>>6)&63),0x80|(n&63));
      else bytes.push(0xF0|(n>>18),0x80|((n>>12)&63),0x80|((n>>6)&63),0x80|(n&63));
    }
    return new Uint8Array(bytes);
  }
  const CRC_TABLE=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xEDB88320^(c>>>1):c>>>1;return c>>>0;});
  function crc32(bytes) {let c=0xFFFFFFFF;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
  function join(chunks) {
    const output=new Uint8Array(chunks.reduce((sum,a)=>sum+a.length,0));let offset=0;
    for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;
  }
  function zip(entries) {
    const local=[],central=[];let offset=0,centralSize=0;
    for(const [path,content] of entries){
      const name=utf8(path),data=utf8(content),crc=crc32(data);
      const header=new Uint8Array(30),v=new DataView(header.buffer);
      v.setUint32(0,0x04034B50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);
      v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      local.push(header,name,data);
      const directory=new Uint8Array(46),d=new DataView(directory.buffer);
      d.setUint32(0,0x02014B50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);
      d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);
      central.push(directory,name);offset+=header.length+name.length+data.length;centralSize+=directory.length+name.length;
    }
    const end=new Uint8Array(22),e=new DataView(end.buffer);
    e.setUint32(0,0x06054B50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    return join([...local,...central,end]);
  }
  function column(index) {let name='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
  function cell(value,col,row,style) {
    const text=String(value??'');if(text.length>32767)throw new Error('Texto excede o limite de uma célula.');
    return '<c r="'+column(col)+row+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+xml(text)+'</t></is></c>';
  }
  function lines(value,width) {
    let count=1,used=0,first=true;
    for(const paragraph of String(value).split(/\r\n|\r|\n/)){
      if(!first)count++;first=false;used=0;
      for(const word of paragraph.split(/\s+/).filter(Boolean)){
        const length=Array.from(word).reduce((sum,c)=>sum+(/[MW@%]/.test(c)?1.3:/[il.,:;'!]/.test(c)?.5:1),0);
        if(used&&used+1+length>width){count++;used=0;}
        if(length>width){count+=Math.ceil(length/width)-1;used=length%width;}else used+=(used?1:0)+length;
      }
    }
    return count;
  }
  function height(values,columns,fontSize,minHeight) {
    const h=Math.max(minHeight,...values.map((v,i)=>lines(v,columns[i].width-2)*fontSize*1.4+12));
    if(h>409.5)throw new Error('Conteúdo alto demais para uma linha da planilha.');
    return Math.ceil(h);
  }

  function worksheet(columns,rows,headerRows=1,idCount=0,top=null) {
    const last=column(columns.length-1),all=top?[top,columns.map(c=>c.label),...rows]:rows;
    const split=column(idCount)+(headerRows+1);
    return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+NS+'"><dimension ref="A1:'+last+all.length+'"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="'+idCount+'" ySplit="'+headerRows+'" topLeftCell="'+split+'" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>'+columns.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(c.width||32)+'" customWidth="1"/>').join('')+'</cols><sheetData>'+all.map((r,i)=>'<row r="'+(i+1)+'" ht="'+height(r,columns,10,i<headerRows?36:30)+'" customHeight="1">'+r.map((v,j)=>cell(v,j,i+1,i<headerRows?2:0)).join('')+'</row>').join('')+'</sheetData>'+ (top?merges(top):'')+'</worksheet>';
  }
  function merges(top){const ranges=[];let a=0;for(let i=1;i<=top.length;i++){if(i===top.length||top[i]!==top[a]){if(i-a>1)ranges.push(column(a)+'1:'+column(i-1)+'1');a=i;}}return ranges.length?'<mergeCells count="'+ranges.length+'">'+ranges.map(r=>'<mergeCell ref="'+r+'"/>').join('')+'</mergeCells>':'';}
  function build({columns,rows,dictionary,source,idCount=5}) {
    if(!columns?.length||rows.some(r=>r.length!==columns.length)||!dictionary?.length||!source?.length)throw Error('Matriz incompatível');
    const sheets=[['Escolas e respostas',worksheet(columns,rows,2,idCount,columns.map(c=>c.theme))],['Dicionário das questões',worksheet(dictionary[0].map(label=>({label,width:40})),dictionary)],['Fonte e metodologia',worksheet(source[0].map(label=>({label,width:75})),source)]];
    return pack(sheets);
  }
  // W18 extends the existing ZIP/XML writer with named thematic worksheets.
  // The legacy three-sheet builder above remains available to the matrix view.
  function workbookSheet(spec){
    const {columns,rows,idCount=0,groups=false,title='',filter=false}=spec;
    if(!columns?.length||columns.length>16384||rows.some(r=>r.length!==columns.length))throw Error('Colunas incompatíveis na planilha.');
    const all=[],merging=[];
    if(title){all.push([title,...Array(columns.length-1).fill('')]);if(columns.length>1)merging.push('A1:'+column(columns.length-1)+'1');}
    if(groups){const top=columns.map(c=>c.theme||'Identificação escolar'),n=all.length+1;all.push(top);let a=0;for(let i=1;i<=top.length;i++)if(i===top.length||top[i]!==top[a]){if(i-a>1)merging.push(column(a)+n+':'+column(i-1)+n);a=i;}}
    all.push(columns.map(c=>c.label));const headerRows=all.length;all.push(...rows);
    if(all.length>1048576)throw Error('Quantidade de linhas excede o limite do Excel.');
    const last=column(columns.length-1),split=column(idCount)+(headerRows+1),pane=idCount?'bottomRight':'bottomLeft';
    const data=all.map((r,i)=>'<row r="'+(i+1)+'" ht="'+(i===0&&title?36:height(r,columns,10,i<headerRows?40:32))+'" customHeight="1">'+r.map((v,j)=>typeof v==='number'&&Number.isFinite(v)?'<c r="'+column(j)+(i+1)+'" s="5" t="n"><v>'+v+'</v></c>':cell(v,j,i+1,i<headerRows?2:0)).join('')+'</row>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+NS+'"><dimension ref="A1:'+last+all.length+'"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="'+idCount+'" ySplit="'+headerRows+'" topLeftCell="'+split+'" activePane="'+pane+'" state="frozen"/></sheetView></sheetViews><cols>'+columns.map((c,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+(c.width||32)+'" customWidth="1"/>').join('')+'</cols><sheetData>'+data+'</sheetData>'+(filter?'<autoFilter ref="A'+headerRows+':'+last+all.length+'"/>':'')+(merging.length?'<mergeCells count="'+merging.length+'">'+merging.map(r=>'<mergeCell ref="'+r+'"/>').join('')+'</mergeCells>':'')+'<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>';
  }
  function buildWorkbook(specs){
    if(!specs?.length||new Set(specs.map(s=>s.name.toLowerCase())).size!==specs.length||specs.some(s=>!s.name||s.name.length>31||/[\\/?*\[\]:]/.test(s.name)))throw Error('Nomes de abas inválidos.');
    return pack(specs.map(s=>[s.name,workbookSheet(s)]));
  }
  function pack(sheets){
        const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
      '<styleSheet xmlns="'+NS+'"><fonts count="4">'+
      '<font><sz val="10"/><color rgb="FF193E53"/><name val="Arial"/><family val="2"/></font>'+
      '<font><sz val="8.25"/><color rgb="FF476477"/><name val="Arial"/><family val="2"/></font>'+
      '<font><b/><sz val="10"/><color rgb="FF143E55"/><name val="Arial"/><family val="2"/></font>'+
      '<font><sz val="10"/><color rgb="FF00689D"/><name val="Arial"/><family val="2"/></font></fonts>'+
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5FA"/><bgColor indexed="64"/></patternFill></fill></fills>'+
      '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD8E7F0"/></bottom><diagonal/></border></borders>'+
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
      '<cellXfs count="6">'+[0,1,2,2,3,0].map((font,i)=>'<xf numFmtId="'+(i===5?0:49)+'" fontId="'+font+'" fillId="'+(i>0&&i<4?2:0)+'" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>').join('')+
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

    const relNS='http://schemas.openxmlformats.org/package/2006/relationships';
    const entries=[['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>'],['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="'+relNS+'"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="'+NS+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>'+sheets.map((s,i)=>'<sheet name="'+xml(s[0])+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>'],['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="'+relNS+'">'+sheets.map((s,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],['xl/styles.xml',styles]];
    sheets.forEach((s,i)=>entries.push(['xl/worksheets/sheet'+(i+1)+'.xml',s[1]]));return zip(entries);
  }
  function download(filename,bytes){const href=URL.createObjectURL(new Blob([bytes],{type:MIME})),a=document.createElement('a');a.href=href;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(href),1500);}
  window.WASH_MATRIX_XLSX=Object.freeze({build,buildWorkbook,download,MIME});
})();
