# Builds graded key-art plates (2400x1200) from real screenshots. Run: python3 build_art.py
from PIL import Image, ImageChops, ImageEnhance, ImageOps, ImageDraw, ImageFilter
import math, random
NAVY=(20,31,58); W,H=2400,1200
COL={'ahd':(232,176,74),'cw':(69,196,164),'gc':(125,154,216),'mov':(232,96,122)}
def load(p): return Image.open('src/'+p).convert('RGB')
def cover(im,w,h,fx=.5,fy=.5):
    s=max(w/im.width,h/im.height); im=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    x=round((im.width-w)*fx); y=round((im.height-h)*fy); return im.crop((x,y,x+w,y+h))
def grade(im,sat=.85,mix=.10):
    im=ImageEnhance.Color(im).enhance(sat)
    im=ImageChops.lighter(im,Image.new('RGB',im.size,NAVY))
    return Image.blend(im,Image.new('RGB',im.size,NAVY),mix)
def duo(im,lo,hi,mid=None):
    g=ImageOps.autocontrast(im.convert('L'),cutoff=1)
    return ImageOps.colorize(g,black=lo,white=hi,mid=mid) if mid else ImageOps.colorize(g,black=lo,white=hi)
def grid(canvas,col,a,step=120,cx=None,cy=None):
    o=Image.new('RGBA',canvas.size,(0,0,0,0)); d=ImageDraw.Draw(o)
    for x in range(0,canvas.width,step): d.line([(x,0),(x,canvas.height)],fill=col+(a,),width=2)
    for y in range(0,canvas.height,step): d.line([(0,y),(canvas.width,y)],fill=col+(a,),width=2)
    canvas.paste(o,(0,0),o)
def line(canvas,pts,col,a,w=5):
    o=Image.new('RGBA',canvas.size,(0,0,0,0)); d=ImageDraw.Draw(o)
    d.line(pts,fill=col+(a,),width=w,joint='curve'); canvas.paste(o,(0,0),o)
def walk(seed,n,x0,x1,y,amp,drift=0):
    r=random.Random(seed); v=0; pts=[]
    for i in range(n):
        v+=r.uniform(-1,1)*amp+drift; pts.append((x0+(x1-x0)*i/(n-1),y+v))
    return pts
def paste_fade(canvas,im,xy,a=1.0,left=0,bottom=0):
    m=Image.new('L',im.size,int(255*a)); d=ImageDraw.Draw(m)
    for i in range(left): d.line([(i,0),(i,im.height)],fill=int(255*a*i/left))
    for i in range(bottom): d.line([(0,im.height-1-i),(im.width,im.height-1-i)],fill=int(255*a*i/bottom))
    canvas.paste(im,xy,m)
def feather(c,im,xy,f=60):
    m=Image.new('L',im.size,0); ImageDraw.Draw(m).rectangle((f,f,im.width-f,im.height-f),fill=255); m=m.filter(ImageFilter.GaussianBlur(f/2)); c.paste(im,xy,m)
def plate(): return Image.new('RGB',(W,H),NAVY)

def ahd():
    c=plate(); m=load('ahd-map.webp').crop((60,230,1540,1010)); m=m.resize((round(m.width*1.0),round(m.height*1.0)),Image.LANCZOS)
    m=grade(m,.95,.05); feather(c,m,(1400-m.width//2,600-m.height//2),70); 
    grid(c,COL['ahd'],22,150)
    line(c,walk(3,40,900,W,1060,14,-3),COL['ahd'],90,6)
    return c
def cw():
    c=plate(); m=load('1-3d-map-cleveland.jpg'); m=cover(m,W,H,.5,.5); c.paste(grade(ImageEnhance.Contrast(m).enhance(1.15),1.1,.22),(0,0))
    s=load('3-markets-goods.jpg'); s=s.resize((round(s.width*1.7),round(s.height*1.7)),Image.LANCZOS)
    paste_fade(c,grade(s,.9,.2),(W-s.width+40,H-s.height-20),.42,left=260,bottom=120)
    grid(c,COL['cw'],20,120)
    line(c,walk(7,50,700,W,300,16,6),COL['cw'],110,6)
    return c
def mov():
    c=plate(); site=load('mov-site.webp'); cap=site.crop((717,105,1025,370)); cap=cap.resize((round(cap.width*3.7),round(cap.height*3.7)),Image.LANCZOS)
    cap=duo(cap,(14,22,44),(236,140,160),(100,40,72)).filter(ImageFilter.GaussianBlur(1.2))
    paste_fade(c,cap,(W-cap.width+40,-60),.5,left=500,bottom=260)
    mp=load('mov-night.jpg').crop((290,116,870,470)); mp=mp.resize((round(mp.width*2.1),round(mp.height*2.1)),Image.LANCZOS)
    feather(c,grade(mp,1.0,.04),(1450-mp.width//2,640-mp.height//2),90)
    bars=load('mov-night.jpg').crop((258,515,942,560)).resize((1368,90),Image.LANCZOS)
    grid(c,COL['mov'],18,150)
    return c
def gc():
    c=plate(); g=load('gc-world.webp'); mp=g.crop((100,420,720,835)); mp=mp.resize((round(mp.width*3.2),round(mp.height*3.2)),Image.LANCZOS)
    mp=mp.resize((round(mp.width*.85),round(mp.height*.85)),Image.LANCZOS); mp=duo(mp,(20,31,58),(104,130,196),(40,60,110)); feather(c,mp,(1500-mp.width//2,640-mp.height//2),110)
    grid(c,COL['gc'],24,120)
    for r_ in (260,420,580): 
        o=Image.new('RGBA',c.size,(0,0,0,0)); ImageDraw.Draw(o).ellipse((1500-r_,640-r_,1500+r_,640+r_),outline=COL['gc']+(40,),width=3); c.paste(o,(0,0),o)
    return c
def alpha(p):
    c=plate(); w=250; g=8; x=860; fx={'ahd':.6,'cw':.5,'mov':.62,'gc':.65}
    for k,key in enumerate(['ahd','cw','mov','gc']):
        t=cover(p[key],w,H,fx[key],.5); c.paste(t,(x+k*(w+g),0))
        ImageDraw.Draw(c).rectangle((x+k*(w+g),H-10,x+k*(w+g)+w,H),fill=COL[key])
    return c
P={'ahd':ahd(),'cw':cw(),'mov':mov(),'gc':gc()}
P['alpha']=alpha(P)
for k,v in P.items(): v.save(f'art/{k}.jpg',quality=84,optimize=True)
cs=Image.new('RGB',(1500,450))
for i,k in enumerate(P): cs.paste(P[k].resize((300,150)),(i*300,0))
cs.save('/tmp/h2/plates.jpg')
