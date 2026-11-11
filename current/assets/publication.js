/* Static GitHub Pages capabilities. Private services are never redirected to loopback. */
(()=>{'use strict';
 const base=new URL('../',document.currentScript.src),original=window.fetch.bind(window);
 const reason='Este recurso utiliza o servidor da versão completa. Nesta publicação estática, estão disponíveis os resultados agregados, o acompanhamento nominal de finalizadas e pendentes, os mapas municipais e os relatórios territoriais.';
 window.WASH_STATIC_PUBLIC_CONFIG=Object.freeze({version:'W28-R1',profile:'aggregate',backendAvailable:false,schoolParticipation:true,schoolResponseWorkbooks:true});
 window.fetch=(input,init)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href);if(url.origin===base.origin&&url.pathname.startsWith(base.pathname+'api/'))return Promise.resolve(new Response(JSON.stringify({error:reason,staticPublication:true}),{status:503,headers:{'Content-Type':'application/json; charset=utf-8'}}));return original(input,init)};
 function mark(){
  const select=document.getElementById('w26Characteristic');if(select){if(!select.disabled)select.disabled=true;if(select.title!==reason)select.title=reason;const note=document.getElementById('w26Availability');const text='O recorte por comunidade tradicional requer a versão com servidor. O diagnóstico agregado de todas as escolas permanece disponível.';if(note&&note.textContent!==text)note.textContent=text;}
  const census=document.getElementById('w28OpenComparison');if(census){if(!census.disabled)census.disabled=true;if(census.title!==reason)census.title=reason;const note=census.parentElement?.querySelector('.w28-note');const text='A comparação com o Censo neste recorte requer a versão com servidor. O catálogo metodológico permanece disponível.';if(note&&note.textContent!==text)note.textContent=text;}
  const central=document.getElementById('reportsTitle');if(central&&!document.getElementById('staticPublicCapabilities')){const note=document.createElement('p');note.id='staticPublicCapabilities';note.className='mon-small';note.textContent='W28-R1: clique no município para ver as escolas finalizadas e pendentes e imprimir o acompanhamento. Os Excel de 31 e 89 questões estão disponíveis após selecionar o município. Mapas por resposta e consultas específicas dependem do servidor da versão completa.';central.parentElement.append(note);}
 }
 document.addEventListener('DOMContentLoaded',()=>{mark();new MutationObserver(mark).observe(document.body,{childList:true,subtree:true})},{once:true});
})();
