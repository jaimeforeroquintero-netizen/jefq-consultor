const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = process.argv[2];
const outRoot = process.argv[3];
const dataRoot = process.argv[4];
const pages = [
  ['inicio','/'],
  ['servicios','/servicios'],
  ['diagnostico','/servicios/diagnostico-seguridad'],
  ['hardening','/servicios/hardening'],
  ['pruebas','/servicios/pruebas-autorizadas'],
  ['informe','/informe-demostrativo'],
  ['valoracion','/valoracion'],
  ['quien-soy','/quien-soy'],
  ['metodologia','/como-trabajamos'],
  ['faq','/preguntas-frecuentes'],
  ['recursos','/recursos'],
  ['autoevaluacion','/autoevaluacion-jefq'],
  ['laboratorio','/laboratorio-jefq'],
  ['orientacion','/orientacion-de-servicios']
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1200, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true }
];

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
ensure(outRoot); ensure(dataRoot);

(async()=>{
  const browser = await chromium.launch({headless:true});
  const all=[];
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport:{width:vp.width,height:vp.height},
      deviceScaleFactor:1,
      isMobile:vp.mobile,
      hasTouch:vp.mobile,
      reducedMotion:'reduce'
    });
    for (const [slug, route] of pages) {
      const page = await context.newPage();
      const url = new URL(route, baseUrl).toString();
      let status = 0;
      let error = '';
      try {
        const response = await page.goto(url,{waitUntil:'networkidle',timeout:60000});
        status = response ? response.status() : 0;
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.screenshot({path:path.join(outRoot,`${slug}-${vp.name}.png`),fullPage:true,animations:'disabled'});
        const audit = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('body *')].filter(el => {
            const text=(el.textContent||'').trim();
            const s=getComputedStyle(el);
            const r=el.getBoundingClientRect();
            return text && r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden';
          });
          const samples=[];
          const backgroundCounts={};
          let under13=0, under14=0, under16=0, totalText=0;
          for (const el of nodes) {
            const own=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ').trim();
            const s=getComputedStyle(el);
            const bg=s.backgroundColor;
            if (bg && bg!=='rgba(0, 0, 0, 0)' && bg!=='transparent') backgroundCounts[bg]=(backgroundCounts[bg]||0)+1;
            if (!own) continue;
            totalText++;
            const px=parseFloat(s.fontSize)||0;
            if(px<13) under13++;
            if(px<14) under14++;
            if(px<16) under16++;
            if(samples.length<180){
              samples.push({
                tag:el.tagName.toLowerCase(),
                className:String(el.className||'').slice(0,100),
                text:own.slice(0,140),
                fontSize:px,
                lineHeight:s.lineHeight,
                color:s.color,
                background:bg,
                fontWeight:s.fontWeight,
                width:Math.round(el.getBoundingClientRect().width)
              });
            }
          }
          const buttons=[...document.querySelectorAll('a,button,input[type="submit"]')].filter(el=>getComputedStyle(el).display!=='none');
          const body=getComputedStyle(document.body);
          const h1=[...document.querySelectorAll('h1')].map(x=>({text:(x.textContent||'').trim(),fontSize:getComputedStyle(x).fontSize,lineHeight:getComputedStyle(x).lineHeight}));
          const h2=[...document.querySelectorAll('h2')].slice(0,30).map(x=>({text:(x.textContent||'').trim(),fontSize:getComputedStyle(x).fontSize}));
          return {
            title:document.title,
            body:{fontSize:body.fontSize,lineHeight:body.lineHeight,color:body.color,background:body.backgroundColor},
            counts:{totalText,under13,under14,under16,buttons:buttons.length,cards:document.querySelectorAll('article,.card,[class*="card"]').length,sections:document.querySelectorAll('section').length},
            h1,h2,samples,
            backgroundCounts:Object.entries(backgroundCounts).sort((a,b)=>b[1]-a[1]).slice(0,20),
            viewport:{width:innerWidth,height:innerHeight},
            scrollHeight:document.documentElement.scrollHeight
          };
        });
        all.push({slug,route,url,viewport:vp.name,status,error,audit,screenshot:`${slug}-${vp.name}.png`});
      } catch(e) {
        error=String(e && e.message || e);
        all.push({slug,route,url,viewport:vp.name,status,error,audit:null,screenshot:null});
      }
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(dataRoot,'visual-audit.json'),JSON.stringify(all,null,2),'utf8');
})().catch(err=>{ console.error(err); process.exit(1); });