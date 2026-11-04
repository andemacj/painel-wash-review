"""Four genuine browser downloads; independent, full-cell reconciliation with the pinned school source."""
import shutil,sqlite3,re,math,zipfile,xml.etree.ElementTree as ET,openpyxl
from qa_support import *
def expected(value,q,status):
 if q.get('nominal_allowed')is not True:return 'Restrito — somente agregado'
 if status!='COMPLETED':return 'Sem autoavaliação finalizada'
 if value is None:return 'Sem resposta — não exibida / não respondida não identificável'
 if q.get('multi_response'):
  value=re.sub(r'^'+re.escape('response_json_'+q['p45_field'])+r'\s*\|?\s*','',str(value));return' | '.join(p.strip()for p in value.split('|')if p.strip())
 if q.get('unit_status')=='VALIDATED'and q.get('unit')and q.get('response_type')in['numérica','numeric']:
  try:
   number=float(value)if str(value).strip()else 0
   if math.isfinite(number):return number
  except(ValueError,TypeError):pass
 return str(value)
def run(uf,ibge,total,completed):
 q=QA('workbooks_'+ibge,preferences={'profile':{'default_content_setting_values':{'automatic_downloads':1}}});q.result['workbooks']=[]
 def work():
  policy=read(E/'policy/workbooks.json');rr=ResidentReader(R,byte_budget=180000000);body=rr.read(policy['source']['path']);assert digest(body)==policy['source']['sha256'];del body;catalog=read(E/'private/catalog.json');questions={x['question_number']:x for x in catalog['questions']};allowed=policy['allowedQuestionNumbers'];projection=','.join('CASE WHEN status=\'COMPLETED\' THEN json_extract(answers,\'$."'+n+'"\') ELSE NULL END AS q'+n for n in allowed);con=sqlite3.connect('file:'+Path(policy['source']['path']).as_posix()+'?mode=ro&immutable=1',uri=True);con.row_factory=sqlite3.Row;source=[dict(r)for r in con.execute('SELECT inep,name,ibge,uf,scope,status,'+projection+' FROM schools WHERE ibge=? ORDER BY name,inep',[ibge])];con.close();assert len(source)==total and sum(r['status']=='COMPLETED'for r in source)==completed;put(A/('workbook_independent_source_'+ibge+'.json'),{'sourceSHA256':policy['source']['sha256'],'queryScope':ibge,'allowedSQLProjection':allowed,'maskedFieldsNotSelected':policy['maskedQuestionNumbers'],'receipts':rr.receipts});q.go();q.select({'uf':uf,'ibge':ibge,'scope':'rural'});original=q.ev('({...W15.context})');town=q.ev('W15.rows.find(r=>r.ibge==='+json.dumps(ibge)+')');scopes=q.ev('W15.scopes');q.ev('W15ReportViewer.selectContext(W15.context);true');folder=q.runtime/'downloads';folder.mkdir();q.c.call('Browser.setDownloadBehavior',{'behavior':'allow','downloadPath':str(folder),'eventsEnabled':True})
  for button,count,selection in[('excel31',31,policy['strategicQuestions']),('excelComplete',89,policy['completeQuestions'])]:
   q.ev("window.__xlsx=null;if(!window.__xlsxhook){window.__xlsxhook=true;addEventListener('w18:excel-ready',e=>window.__xlsx=e.detail)}true");old=set(folder.glob('*.xlsx'));q.ev("document.querySelector('#"+button+"').scrollIntoView({block:'center',behavior:'instant'});true");point=q.ev("(()=>{const r=document.querySelector('#"+button+"').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()");q.c.call('Input.dispatchMouseEvent',{'type':'mouseMoved',**point});q.c.call('Input.dispatchMouseEvent',{'type':'mousePressed','button':'left','clickCount':1,**point});q.c.call('Input.dispatchMouseEvent',{'type':'mouseReleased','button':'left','clickCount':1,**point});q.wait('!!window.__xlsx',timeout=90);meta=q.ev('__xlsx');end=time.monotonic()+45;files=[]
   while time.monotonic()<end:
    files=[p for p in folder.glob('*.xlsx')if p not in old]
    if len(files)==1 and not list(folder.glob('*.crdownload')):break
    time.sleep(.15)
   assert len(files)==1;target=A/'xlsx'/(ibge+'_'+str(count)+'.xlsx');target.parent.mkdir(exist_ok=True);shutil.copyfile(files[0],target);book=openpyxl.load_workbook(target,read_only=True,data_only=False);main=book['RESPOSTAS_31'if count==31 else'RESPOSTAS_COMPLETAS']if len(book.sheetnames)>1 else book.worksheets[0];cells=list(main.iter_rows());headers=[c.value for c in cells[2]];actual=[re.match(r'^Q(\d+)',str(v)).group(1)for v in headers[7:]];q.check(actual==selection and len(actual)==count,str(count)+' exact real catalog question columns');q.check(book.sheetnames==['respostas_'+str(count)]and meta['sheets']==1,str(count)+' exactly one worksheet with the approved name');title=str(cells[0][0].value);q.check(all(t in title for t in['Autoavaliação WASH','2026-10-26','2026-10-27',policy['releaseId']]),str(count)+' source, response date, collection date and release retained inside the sole worksheet');rows=cells[3:];q.check(len(rows)==total and len({r[0].value for r in rows})==total,str(count)+' every eligible school exactly once including pending');checked=0;restricted=0;missing=0
   for source_row,row in zip(source,rows):
    identity=[source_row['inep'],source_row['name'],source_row['ibge'],town['name'],uf,scopes[source_row['scope']],'Finalizada'if source_row['status']=='COMPLETED'else'Pendente'];assert [c.value for c in row[:7]]==identity,'Identity row diverges';assert row[0].data_type=='s'and row[0].number_format=='@'and row[2].data_type=='s'and row[2].number_format=='@','IDs must remain text'
    for number,cell in zip(actual,row[7:]):
     wanted=expected(source_row.get('q'+number),questions[number],source_row['status']);got=cell.value if cell.value is not None else'';assert got==wanted,(ibge,number,'Workbook cell differs from approved canonical formatting');assert cell.data_type!='f';checked+=1;restricted+=wanted=='Restrito — somente agregado';missing+=wanted=='Sem resposta — não exibida / não respondida não identificável'
   q.check(True,str(count)+' every identity and answer cell reconciles independently with canonical allowed fields');q.check(sum(r[6].value=='Pendente'for r in rows)==total-completed,str(count)+' pending school rows remain distinct without invented answers');q.check(q.ev('({...W15.context})')==original,str(count)+' central Geral export leaves global Rural filter unchanged');schema='http://schemas.openxmlformats.org/spreadsheetml/2006/main';formula_count=0
   with zipfile.ZipFile(target)as archive:
    for name in archive.namelist():
     if name.startswith('xl/worksheets/')and name.endswith('.xml'):formula_count+=len(ET.fromstring(archive.read(name)).findall('.//{'+schema+'}f'))
   q.check(formula_count==0,str(count)+' all worksheets use safe text/numeric cells without formulas');logical=[]
   for sheet in book:
    values=[]
    for row in sheet.iter_rows(values_only=True):
     if sheet.title=='LEIA-ME'and row[0]=='Geração':row=(row[0],'<GENERATION_TIME>')
     values.append(row)
    logical.append({'sheet':sheet.title,'rows':values})
   if len(book.sheetnames)>1:
    info={row[0].value:row[1].value for row in list(book['LEIA-ME'].iter_rows())[2:]};q.check(info['Referência das respostas']=='2026-10-26'and str(info['Atualização / coleta']).startswith('2026-10-27')and info['Release']==policy['releaseId'],str(count)+' workbook identifies its frozen response date, collection and release');q.check(book['DICIONARIO'].max_row-2==count,str(count)+' dictionary contains precisely the chosen catalog');q.check('não somar linhas'in info['Organização'],str(count)+' repeated thematic views are explicitly documented')
   amendment=read(A/'single_sheet_amendment.json');previous=E/amendment['amendmentRoot']/'before/audit/xlsx'/(ibge+'_'+str(count)+'.xlsx');old_book=openpyxl.load_workbook(previous,read_only=True);old_main=old_book['RESPOSTAS_31'if count==31 else'RESPOSTAS_COMPLETAS'];old_matrix=list(old_main.iter_rows(min_row=2,values_only=True));current_matrix=[tuple(c.value for c in row)for row in cells[1:]];q.check(current_matrix==old_matrix,str(count)+' all theme headers, question headers, identities and responses exactly equal the preserved thematic matrix');matrix_hash=digest(raw(current_matrix));old_book.close()
   q.result['workbooks'].append({'file':str(target.relative_to(E)),'sha256':sha(target),'logicalSHA256':digest(raw(logical)),'preservedMatrixLogicalSHA256':matrix_hash,'sameMatrixAsBefore':True,'bytes':target.stat().st_size,'municipality':ibge,'schools':total,'completed':completed,'pending':total-completed,'questions':count,'permitted':count-len(set(selection)&set(policy['maskedQuestionNumbers'])),'restrictedQuestions':sorted(set(selection)&set(policy['maskedQuestionNumbers'])),'responseCellsIndependentlyChecked':checked,'maskedCells':restricted,'missingCells':missing,'sheets':book.sheetnames,'metadata':meta,'globalFilterUnchanged':True,'sourceSQLRestrictedFieldsRead':False});q.save();book.close();print(ibge,count,'PASS',total,'schools',checked,'answer cells',flush=True)
  # Synthetic formula-safety fixture remains inside QA only, never served as school data.
  result=q.ev("(()=>{const bytes=WASH_MATRIX_XLSX.buildWorkbook([{name:'SAFE_QA',title:'QA',columns:[{label:'Texto'}],rows:[['=1+1'],['+cmd'],['-formula'],['@SUM(A1)']],idCount:0}]);return btoa(String.fromCharCode(...bytes))})()");fixture=A/'xlsx'/('formula_safety_'+ibge+'.xlsx');fixture.write_bytes(base64.b64decode(result));b=openpyxl.load_workbook(fixture);q.check([r[0].value for r in list(b.active.iter_rows())[2:]]==['=1+1','+cmd','-formula','@SUM(A1)']and all(c.data_type=='s'for r in list(b.active.iter_rows())[2:]for c in r),'Actual approved writer preserves formula-like input literally');b.close()
 return main_guard(q,work)
if __name__=='__main__':sys.exit(0 if all(run(*args)for args in[('PI','2200707',13,9),('PA','1506807',409,406)])else 1)
