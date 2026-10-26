document.querySelectorAll('[data-prompt-composer]').forEach(form=>{
  form.hidden=false;
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const data=new FormData(form);
    const subject=String(data.get('subject')||'画面中的主体').trim().slice(0,120);
    const action=String(data.get('action')||'完成一个连续动作').trim().slice(0,120);
    const camera=String(data.get('camera')||'保持固定镜头').trim();
    form.parentElement.querySelector('[data-prompt-result]').textContent=`${subject}，${action}。${camera}。保持动作连贯，让观众看清这一刻的变化。`;
  });
});
document.querySelectorAll('[data-copy-example]').forEach(button=>{
  button.addEventListener('click',async()=>{
    const text=button.parentElement.querySelector('.example-copy').textContent;
    const status=button.parentElement.querySelector('.copy-status');
    try{await navigator.clipboard.writeText(text);status.textContent='已复制，可以带到工作台继续。';}
    catch{status.textContent='暂时无法自动复制，请选中上方描述进行复制。';}
  });
});
