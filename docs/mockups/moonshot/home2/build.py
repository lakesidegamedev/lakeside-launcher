# Emits a.html, b.html, c.html. Run: python3 build.py
S=[
 dict(k='ahd',c='ahdc',plate='ahd',pos='62% 50%',tp='62% 50%',tz='170%',kick='Opens Sunday',wm='<div class="wm ahd">A House Divided <span class="v">1.20</span></div>',
      h='The 2027 world',lead='Opens Sunday November 15, 5:00 PM Eastern.',p='Install',s='Open the post',cd='2026-11-15T22:00:00Z',rk='A House Divided 1.20',rt='The 2027 world opens Sunday'),
 dict(k='alpha',c='lkc',plate='alpha',pos='72% 50%',tp='80% 50%',tz='130%',kick='Studio news',wm='<div class="wm lk"><img src="lakeside-mark.svg" alt="">Lakeside Games</div>',
      h='Our games are leaving alpha',lead='Everything is free until Monday 5:00 PM Eastern.',p='Play free',s='Open the post',rk='Studio news',rt='Everything is free until Monday'),
 dict(k='cw',c='cwc',plate='cw',pos='62% 50%',tp='60% 40%',tz='190%',kick='New release',wm='<div class="wm cw">Corporate Warfare <span class="v">2.0</span></div>',
      h='Rivals',lead='3D city maps, plant models and live goods markets.',p='Install',s='Open the post',rk='Corporate Warfare 2.0',rt='Rivals'),
 dict(k='mov',c='movc',plate='mov',pos='64% 50%',tp='64% 50%',tz='160%',kick='New release',wm='<div class="wm mov">Margin of Victory <span class="v">2.0</span></div>',
      h='121 elections, 14 countries',lead='Run a real campaign, turn by turn. 15 elections are free forever.',p='Play free',s='Open the post',rk='Margin of Victory 2.0',rt='121 elections, 14 countries'),
 dict(k='gc',c='gcc',plate='gc',pos='64% 50%',tp='62% 50%',tz='170%',kick='Early access',wm='<div class="wm gc">Grand Century</div>',
      h='Early access, free in your browser',lead='Take a nation from 1700 to 1945. Nothing to download.',p='Play free',s='Open the post',rk='Grand Century',rt='Early access, free in your browser'),
]
CD='<div class="cd" data-cd="%s"><div><b class="d">2</b><span>days</span></div><div><b class="h">16</b><span>hours</span></div><div><b class="m">00</b><span>min</span></div><div><b class="s">00</b><span>sec</span></div></div>'
def slide(s,i,extra='',cd=True):
    return f'''<article class="slide {s['c']}{' on' if i==0 else ''}" style="--pos:{s['pos']}" role="group" aria-roledescription="slide" aria-label="{i+1}">
<div class="art" style="background-image:url(art/{s['plate']}.jpg)"></div><div class="scrim"></div>
<div class="txt"><div class="toprow">{s['wm']}<span class="kick"><span class="dot"></span>{s['kick']}</span></div><h2 class="hl">{s['h']}</h2><p class="lead">{s['lead']}</p>{(CD%s['cd']) if (s.get('cd') and cd) else ''}<div class="acts"><a class="btn p big" href="#">{s['p']}</a><a class="btn quiet big" href="#">{s['s']}</a></div></div>
<div class="pg"><i></i></div>{extra}</article>'''
def thumb(s): return f'background-image:url(art/{s["plate"]}.jpg);background-size:{s["tz"]};background-position:{s["tp"]}'

TOP='''<div class="top"><div class="brand"><img src="lakeside-mark.svg" alt="">Lakeside Games</div>
<a class="tab on">Home</a><a class="tab">Library</a><a class="tab">Store</a><a class="tab">Downloads<span class="n">2</span></a><a class="tab">News</a>
<a class="acct"><span class="av">K</span>kepler</a></div>'''
STATUS='''<div class="status"><span><b>Downloading</b> A House Divided 1.19.0</span><span class="bar"><i style="width:62%"></i></span><span>62%, 8.4 MB/s</span><span class="muted">1 more waiting</span><span class="sp">Downloads</span></div>'''
def jt(k,c,plate,pos,name,last,hrs,btn='Play',tag=''):
    return f'''<div class="jt {c}"><div class="jart" style="background-image:url(art/{plate}.jpg);background-position:{pos};background-size:240%"></div><div class="jb2"><b>{name}</b><small>Last played <em>{last}</em></small><small>{hrs}{tag}</small></div><div class="jact"><a class="btn p sm">{btn}</a></div></div>'''
BELOW='''<div class="below">
<div><h2>Jump back in<a>All 5 games in Library</a></h2><div class="jb">'''+jt('ahd','ahdc','ahd','58% 40%','A House Divided','today','41 h played','Update',' · <span class="upd">1.19.0 ready</span>')+jt('mov','movc','mov','60% 50%','Margin of Victory','2 days ago','12 h played')+jt('cw','cwc','cw','55% 60%','Corporate Warfare','Nov 9','6 h played')+'''</div></div>
<div class="cols2"><div><h2>What changed<a>Release notes</a></h2><table class="feed">
<tr><td><span class="g2"><span class="dot" style="background:var(--cw)"></span>Corporate Warfare</span></td><td><span class="tag">2.0</span></td><td class="s">Rivals: 3D city maps, plant models and live goods markets.</td><td class="d">Nov 12</td></tr>
<tr><td><span class="g2"><span class="dot" style="background:var(--mov)"></span>Margin of Victory</span></td><td><span class="tag">2.0</span></td><td class="s">121 elections across 14 countries.</td><td class="d">Nov 12</td></tr>
<tr><td><span class="g2"><span class="dot" style="background:var(--ahd)"></span>A House Divided</span></td><td><span class="tag">1.19</span></td><td class="s">Every sale has a buyer.</td><td class="d">Nov 10</td></tr>
<tr><td><span class="g2"><span class="dot" style="background:var(--brass)"></span>Launcher</span></td><td><span class="tag">0.6.1</span></td><td class="s">Windows sign-in opens the full link in your browser.</td><td class="d">Nov 13</td></tr>
<tr><td><span class="g2"><span class="dot" style="background:var(--gc)"></span>Grand Century</span></td><td><span class="tag">1.7</span></td><td class="s">The Long Century.</td><td class="d">Sep 2</td></tr></table></div>
<div><h2>Your account<a>Manage</a></h2><div class="acc"><div class="ah"><span class="av">K</span><div><b>kepler</b><small>Supporter+ · $9.99 a month</small></div><a class="btn sm">Account</a></div>
<ul><li><span class="dot" style="background:var(--ok)"></span>Every Lakeside game, all paid access</li><li><span class="dot" style="background:var(--ok)"></span>A House Divided single-player and sandbox</li><li><span class="dot" style="background:var(--ok)"></span>Every Margin of Victory pack</li><li><span class="dot" style="background:var(--warn)"></span>Free for everyone until Monday 5:00 PM ET</li></ul></div></div></div></div>'''

JS='''<script>
(function(){
var q=new URLSearchParams(location.search),root=document.documentElement,show=document.querySelector(".show");
var sl=[].slice.call(show.querySelectorAll(".slide")),ctl=[].slice.call(show.querySelectorAll("[data-go]")),i=0;
var T=q.get("t");if(T!==null){root.classList.add("frozen");root.style.setProperty("--t",T)}
function go(n){i=(n+sl.length)%sl.length;sl.forEach(function(s,k){s.classList.toggle("on",k==i)});ctl.forEach(function(c){c.classList.toggle("on",+c.dataset.go==i);c.setAttribute("aria-current",+c.dataset.go==i)})}
show.addEventListener("animationend",function(e){if(e.target.matches(".pg i")&&e.target.closest(".on"))go(i+1)});
ctl.forEach(function(c){c.addEventListener("click",function(){go(+c.dataset.go)})});
show.tabIndex=0;show.addEventListener("keydown",function(e){if(e.key=="ArrowRight"||e.key=="ArrowDown")go(i+1);if(e.key=="ArrowLeft"||e.key=="ArrowUp")go(i-1)});
var m=q.get("slide");if(m)go(+m-1);
function pad(n){return n<10?"0"+n:""+n}
function tick(){document.querySelectorAll("[data-cd]").forEach(function(el){var ms=Math.max(0,new Date(el.dataset.cd)-Date.now()),s=Math.floor(ms/1000);
var v={d:Math.floor(s/86400),h:pad(Math.floor(s%86400/3600)),m:pad(Math.floor(s%3600/60)),s:pad(s%60)};for(var k in v){var n=el.querySelector("."+k);if(n)n.textContent=v[k]}})}
tick();setInterval(tick,1000);
if(q.get("scroll"))document.querySelector("main").scrollTop=1e5;
})();
</script>'''
def page(title,css,body):
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><link rel="stylesheet" href="launcher.css"><link rel="stylesheet" href="home2.css"><style>{css}</style></head><body class="h2">{TOP}<main class="scroll">{body}{BELOW}</main>{STATUS}{JS}</body></html>'

# ---------- A: vertical rail ----------
A_CSS='''
.show{height:clamp(440px,58vh,640px)}
.scrim{background:linear-gradient(90deg,rgba(20,31,58,.97) 0%,rgba(20,31,58,.9) 28%,rgba(20,31,58,.5) 52%,rgba(20,31,58,0) 72%),linear-gradient(0deg,rgba(20,31,58,.85) 0%,rgba(20,31,58,0) 34%)}
.txt{left:clamp(28px,4vw,64px);bottom:clamp(34px,7vh,64px);max-width:min(680px,calc(100% - clamp(300px,24vw,350px) - 120px))}
.slide .pg{right:clamp(280px,23vw,340px)}
.rail{position:absolute;right:0;top:0;bottom:0;width:clamp(280px,23vw,340px);background:rgba(20,31,58,.93);border-left:1px solid var(--line);display:flex;flex-direction:column;z-index:3}
.ri{position:relative;flex:1;display:flex;align-items:center;gap:12px;padding:0 14px 0 14px;border-bottom:1px solid var(--line);opacity:.72}
.ri:last-child{border-bottom:0}
.ri:hover{opacity:1;background:var(--ground-2)}
.ri.on{opacity:1;background:var(--plate)}
.ri.on::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--ac)}
.ri .th{width:clamp(88px,7.6vw,112px);aspect-ratio:16/9;border-radius:3px;border:1px solid var(--line);flex:none;background-repeat:no-repeat}
.ri .tt{min-width:0}
.ri .tt small{display:block;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ri .tt b{display:block;font-size:clamp(13px,1.05vw,15px);line-height:1.2;font-weight:600}
.ri .pg{height:3px}
'''
def a():
    sl=''.join(slide(s,i) for i,s in enumerate(S))
    rail=''.join(f'<button class="ri {s["c"]}{" on" if i==0 else ""}" data-go="{i}" aria-label="Show: {s["rt"]}"><span class="th" style="{thumb(s)}"></span><span class="tt"><small>{s["rk"]}</small><b>{s["rt"]}</b></span><span class="pg"><i></i></span></button>' for i,s in enumerate(S))
    return page('Home A: rail',A_CSS,f'<section class="show" aria-roledescription="carousel" aria-label="What is new">{sl}<nav class="rail" aria-label="Slides">{rail}</nav></section>')

# ---------- B: filmstrip ----------
B_CSS='''
.show{height:clamp(500px,66vh,690px);overflow:visible;background:none}
.stage{position:absolute;left:0;right:0;top:0;height:calc(100% - 62px);overflow:hidden}
.stage .slide{position:absolute}
.scrim{background:linear-gradient(90deg,rgba(20,31,58,.97) 0%,rgba(20,31,58,.88) 30%,rgba(20,31,58,.4) 58%,rgba(20,31,58,0) 78%),linear-gradient(0deg,var(--ground) 0%,rgba(20,31,58,.85) 22%,rgba(20,31,58,0) 52%)}
.txt{left:clamp(28px,4vw,64px);bottom:clamp(92px,15vh,128px);max-width:min(700px,60%)}
.stage .pg{display:none}
.strip{position:absolute;left:16px;right:16px;bottom:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;align-items:end;z-index:4;height:clamp(104px,15vh,132px)}
.tile{position:relative;height:100%;border:1px solid var(--line);border-radius:4px;overflow:hidden;background-color:var(--plate);background-repeat:no-repeat;transition:transform .3s ease,border-color .3s;filter:brightness(.8) saturate(.9)}
.tile::before{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(20,31,58,.96) 0%,rgba(20,31,58,.7) 48%,rgba(20,31,58,.1) 100%)}
.tile::after{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--ac)}
.tile .lb{position:absolute;left:12px;right:10px;bottom:10px}
.tile small{display:block;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile b{display:block;font-size:clamp(13px,1.1vw,15px);line-height:1.2;font-weight:600}
.tile:hover{filter:none}
.tile.on{transform:translateY(-16px);border-color:var(--brass);filter:none;box-shadow:0 12px 26px rgba(8,12,26,.55)}
.tile .pg{height:4px;background:rgba(244,246,251,.18);z-index:2}
.tile:not(.on) .pg{display:none}
'''
def b():
    sl=''.join(slide(s,i) for i,s in enumerate(S))
    tiles=''.join(f'<button class="tile {s["c"]}{" on" if i==0 else ""}" data-go="{i}" style="{thumb(s)}" aria-label="Show: {s["rt"]}"><span class="lb"><small>{s["rk"]}</small><b>{s["rt"]}</b></span><span class="pg"><i></i></span></button>' for i,s in enumerate(S))
    return page('Home B: filmstrip',B_CSS,f'<section class="show" aria-roledescription="carousel" aria-label="What is new"><div class="stage">{sl}</div><nav class="strip" aria-label="Slides">{tiles}</nav></section>')

# ---------- C: split ----------
C_CSS='''
.show{height:clamp(450px,60vh,650px);display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,29vw,440px);gap:4px;background:var(--ground)}
.dom{position:relative;overflow:hidden;background:var(--ground)}
.scrim{background:linear-gradient(90deg,rgba(20,31,58,.97) 0%,rgba(20,31,58,.9) 30%,rgba(20,31,58,.45) 58%,rgba(20,31,58,0) 80%),linear-gradient(0deg,rgba(20,31,58,.92) 0%,rgba(20,31,58,0) 30%)}
.txt{left:clamp(24px,3.4vw,52px);bottom:clamp(60px,9vh,84px);max-width:66%}
.hl{font-size:clamp(44px,4.2vw,60px)}
.dom .slide .pg{display:none}
.segs{position:absolute;left:0;right:0;bottom:0;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;z-index:3;padding:0 0 0 0}
.seg{position:relative;padding:12px clamp(16px,2.2vw,32px) 11px;background:rgba(20,31,58,.88);border-top:1px solid var(--line);opacity:.78;display:flex;gap:8px;align-items:center;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.seg .dot{background:var(--ac)}
.seg.on{opacity:1;background:var(--plate)}
.seg .pg{height:4px}
.live{display:grid;grid-template-rows:1fr 1fr;gap:4px;min-height:0}
.lp{position:relative;overflow:hidden;padding:14px 18px;display:flex;flex-direction:column;justify-content:center;gap:6px;min-height:0}
.lp .bg{position:absolute;inset:0;background-size:cover}
.lp .sc{position:absolute;inset:0;background:linear-gradient(90deg,rgba(20,31,58,.95) 0%,rgba(20,31,58,.78) 50%,rgba(20,31,58,.3) 100%)}
.lp>*:not(.bg):not(.sc){position:relative}
.lp .kick{align-self:flex-start}
.lp h3{text-wrap:balance;font-size:clamp(20px,1.8vw,26px);line-height:1.08;font-weight:700;letter-spacing:-.01em;margin:0}
.lp p{font-size:13px;color:var(--text);opacity:.9;line-height:1.3}
.lp .cd{margin-top:2px}
.lp .cd div{min-width:0;flex:1;padding:4px 6px 3px;background:rgba(20,31,58,.8)}
.lp .cd b{font-size:clamp(22px,2vw,30px)}
.lp .row{display:flex;gap:8px;align-items:center}
.gm{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.gm span{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;border:1px solid rgba(244,246,251,.22);background:rgba(20,31,58,.7);border-radius:3px;padding:3px 8px;white-space:nowrap}
.left{height:5px;background:rgba(244,246,251,.16);border-radius:3px;overflow:hidden}
.left i{display:block;height:100%;width:68%;background:var(--brass)}
.lp small.l{font-size:12px;color:var(--text-2)}
'''
def c():
    D=[S[2],S[3],S[4]]
    sl=''.join(slide(s,i) for i,s in enumerate(D))
    segs=''.join(f'<button class="seg {s["c"]}{" on" if i==0 else ""}" data-go="{i}" aria-label="Show: {s["rk"]}"><span class="dot"></span>{s["rk"]}<span class="pg"><i></i></span></button>' for i,s in enumerate(D))
    A_,L_=S[0],S[1]
    live=f'''<div class="live"><aside class="lp ahdc" aria-label="Countdown"><div class="bg" style="background-image:url(art/ahd.jpg);background-position:58% 45%"></div><div class="sc"></div>
<span class="kick"><span class="dot"></span>Opens Sunday</span><h3>A House Divided 1.20: the 2027 world</h3>{CD%A_['cd']}<div class="row"><a class="btn p sm">Install</a><small class="l">Sunday November 15, 5:00 PM Eastern</small></div></aside>
<aside class="lp lkc" aria-label="Free this weekend"><div class="bg" style="background-image:url(art/alpha.jpg);background-position:80% 50%"></div><div class="sc"></div>
<span class="kick"><span class="dot"></span>Free this weekend</span><h3>Our games are leaving alpha</h3><p>Everything is free until Monday 5:00 PM Eastern.</p>
<div class="gm"><span><i class="dot" style="background:var(--ahd)"></i>A House Divided</span><span><i class="dot" style="background:var(--mov)"></i>Margin of Victory</span><span><i class="dot" style="background:var(--cw)"></i>Corporate Warfare</span><span><i class="dot" style="background:var(--gc)"></i>Grand Century</span></div>
<div class="row"><a class="btn p sm">Play free</a><a class="btn quiet sm">Open the post</a><span class="left" style="flex:1"><i></i></span></div></aside></div>'''
    return page('Home C: split',C_CSS,f'<section class="show" aria-roledescription="carousel" aria-label="What is new"><div class="dom">{sl}<nav class="segs" aria-label="Slides">{segs}</nav></div>{live}</section>')
for n,f in (('a',a),('b',b),('c',c)): open(f'{n}.html','w').write(f())
print('ok')
