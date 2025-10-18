<script>
const npub=localStorage.getItem('libermedia_npub');
if(!npub){alert('Faça login!');location.href='/';}
document.getElementById('npubShort').innerText=npub.slice(0,20)+'...';

const drop=document.getElementById('drop');
const input=document.getElementById('input');
let pasta='Todas';

drop.onclick=()=>input.click();
drop.ondragover=e=>{e.preventDefault();drop.classList.add('border-yellow-500');};
drop.ondragleave=()=>drop.classList.remove('border-yellow-500');
drop.ondrop=e=>{e.preventDefault();drop.classList.remove('border-yellow-500');enviar(e.dataTransfer.files);};
input.onchange=()=>enviar(input.files);

async function enviar(files){
  for(let f of files){
    const fd=new FormData();
    fd.append('file',f);
    fd.append('npub',npub);
    fd.append('pasta',pasta==='Todas'?'Geral':pasta);
    try{
      const r=await fetch('/api/upload',{method:'POST',body:fd});
      if((await r.json()).status!=='ok')alert('Erro: '+f.name);
    }catch{alert('Erro');}
  }
  carregar();
}

async function carregar(){
  try{
    let url='/api/arquivos?npub='+npub;
    if(pasta!=='Todas')url+='&pasta='+pasta;
    const r=await fetch(url);
    const d=await r.json();
    const lista=document.getElementById('lista');
    
    if(d.status!=='ok'||!d.arquivos.length){
      lista.innerHTML='<p class="text-gray-600 dark:text-gray-400 text-center py-8">Nenhum arquivo.</p>';
      document.getElementById('total').innerText='0';
      return;
    }
    
    document.getElementById('total').innerText=d.arquivos.length;
    
    let html='';
    for(let a of d.arquivos){
      const icone={'image':'🖼️','video':'🎥','audio':'🎵'}[a.tipo]||'📄';
      const mb=(a.tamanho/1024/1024).toFixed(2);
      
      html+='<div class="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg flex justify-between items-center border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800">';
      html+='<div class="flex items-center gap-3">';
      
      if(a.tipo==='image'){
        html+='<img src="'+a.url+'" class="w-16 h-16 object-cover rounded border-2 cursor-pointer hover:scale-105" onclick="ver(\''+a.url+'\',\''+a.nome+'\')">';
      }else{
        html+='<span class="text-4xl">'+icone+'</span>';
      }
      
      html+='<div><p class="font-bold text-gray-900 dark:text-white">'+a.nome+'</p><p class="text-xs text-gray-600 dark:text-gray-400">'+mb+' MB • '+a.pasta+'</p></div></div>';
      html+='<div class="flex gap-2">';
      html+='<button onclick="copiar('+a.id+',\''+a.url+'\')" class="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 p-2 rounded" title="Copiar link">🔗</button>';
      html+='<a href="'+a.url+'" download class="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 p-2 rounded" title="Download">⬇️</a>';
      html+='</div></div>';
    }
    lista.innerHTML=html;
  }catch(e){console.error(e);}
}

async function copiar(id,url){
  try{
    const ext=url.split(".").pop();
    const link=window.location.origin+"/f/"+id+"."+ext;
    await navigator.clipboard.writeText(link);
    mostrarToast("🔗 Link copiado: /f/"+id+"."+ext);
  }catch{mostrarToast("❌ Erro");}
}

function mostrarToast(msg){
  const t=document.createElement('div');
  t.className='fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-2xl z-50';
  t.innerText=msg;
  document.body.appendChild(t);
  setTimeout(()=>t.remove(),2000);
}

function filtrar(p){pasta=p;carregar();}
function ver(url,n){document.getElementById('img').src=url;document.getElementById('nome').innerText=n;document.getElementById('modal').classList.remove('hidden');}
function fechar(){document.getElementById('modal').classList.add('hidden');}
function sair(){if(confirm('Sair?')){localStorage.clear();location.href='/';}}
document.addEventListener('keydown',e=>{if(e.key==='Escape')fechar();});
carregar();
</script>
