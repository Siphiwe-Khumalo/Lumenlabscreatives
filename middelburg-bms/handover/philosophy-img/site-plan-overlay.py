# Draws the labels for Figure 1 (site-plan.png) over site-plan-base.png (simplified from drawing ME-MB-HVAC-01;
# warehouse-plan-crop.png is the original crop). Run in philosophy-img/: python3 site-plan-overlay.py, then
# screenshot overlay.html at 1232x1259 (deviceScaleFactor 2) with Playwright and resize to 1848 px wide.
OX,OY=150,60          # base image offset in the canvas
W,H=150+912+170,60+1024+175
HYB='#0E7C7A'; RTU='#7C3AED'; SEN='#B45309'; DUCT='#1D4ED8'; INK='#111827'
o=[]
def T(x,y,s,size=16,anchor='start',w='700',fill=INK,halo=True):
    st=f' paint-order="stroke" stroke="#fff" stroke-width="5" stroke-linejoin="round"' if halo else ''
    o.append(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{w}" fill="{fill}"{st}>{s}</text>')
def tag(cx,cy,s,col,w=78,h=26,size=16):
    o.append(f'<rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="4" fill="{col}"/>'); T(cx,cy+size*0.36,s,size,'middle','700','#fff',False)
def sensor(x,y,lab,side='r'):
    o.append(f'<circle cx="{x}" cy="{y}" r="8" fill="#fff" stroke="{SEN}" stroke-width="3.5"/><circle cx="{x}" cy="{y}" r="3" fill="{SEN}"/>')
    if lab: T(x+13 if side=='r' else x-13, y+5, lab, 14, 'start' if side=='r' else 'end', '700', SEN)
B=lambda x,y:(OX+x,OY+y)
# ducts: (line, x, top) in base-image pixels; risers at y≈884
ducts=[(1,144,238),(2,271,239),(3,381,238),(4,537,328),(5,644,325),(6,752,323)]
for n,x,top in ducts:
    dx,dy=B(x-7,top); o.append(f'<rect x="{dx}" y="{dy}" width="14" height="{884-top-8}" fill="{DUCT}" fill-opacity="0.10" stroke="{DUCT}" stroke-width="2.2"/>')
    cx,ct=B(x,top); T(cx,ct-12,f'Line {n}',17,'middle','800',DUCT)
    ys=[top+70, top+0.55*(884-top), 845]
    for i,y in enumerate(ys):
        sx,sy=B(x+14,y); sensor(sx,sy,f'L{n}-{i+1}')
    rx,ry=B(x,906); tag(rx,ry,f'HYB-0{n}',HYB)
# RTUs: tag position in canvas margin, 2 sensors in base coords, leader target
rtus=[('RTU-01',(70,OY+800),[(30,745),(30,862)],(30,800)),
      ('RTU-02',(OX+150,OY+1024+40),[(118,985),(300,948)],(200,990)),
      ('RTU-03',(OX+430,OY+1024+40),[(395,950),(470,1002)],(430,980)),
      ('RTU-04',(OX+700,OY+1024+40),[(610,958),(740,1000)],(690,985)),
      ('RTU-05',(OX+912+85,OY+175),[(525,245),(640,160)],(668,262))]
for name,(tx,ty),ss,(lx,ly) in rtus:
    ax,ay=B(lx,ly); o.append(f'<line x1="{tx}" y1="{ty}" x2="{ax}" y2="{ay}" stroke="{RTU}" stroke-width="2.5" stroke-dasharray="7 5"/>')
    tag(tx,ty,name,RTU,84)
    for i,(x,y) in enumerate(ss):
        sx,sy=B(x,y); sensor(sx,sy,f'{name[-1]}{"AB"[i]}', 'r')
# title + north + legend
T(20,32,'Warehouse HVAC and monitoring layout',24,'start','800',INK,False)
o.append(f'<path d="M{W-40} 14 L{W-28} 46 L{W-40} 39 L{W-52} 46 Z" fill="{INK}"/>'); T(W-40,64,'N',17,'middle','800',INK,False)
ly=H-40
o.append(f'<rect x="20" y="{ly-15}" width="16" height="30" fill="none" stroke="{DUCT}" stroke-width="2"/>'); T(46,ly+6,'Supply air line (duct)',16,'start','400',INK,False)
tag(300,ly,'HYB',HYB,58); T(336,ly+6,'Hybrid (VRF) unit, duct riser to its line',16,'start','400',INK,False)
tag(700,ly,'RTU',RTU,58); T(736,ly+6,'Rooftop unit, serves the area shown',16,'start','400',INK,False)
o.append(f'<circle cx="1040" cy="{ly}" r="8" fill="#fff" stroke="{SEN}" stroke-width="3.5"/><circle cx="1040" cy="{ly}" r="3" fill="{SEN}"/>'); T(1056,ly+6,'Temp + RH sensor',16,'start','400',INK,False)
html=f'''<!doctype html><html><body style="margin:0;background:#fff"><div style="position:relative;width:{W}px;height:{H}px;font-family:Arial,'Liberation Sans',sans-serif">
<img src="site-plan-base.png" style="position:absolute;left:{OX}px;top:{OY}px;width:912px;height:1024px">
<svg style="position:absolute;left:0;top:0" width="{W}" height="{H}" font-family="Arial, Liberation Sans, sans-serif">{''.join(o)}</svg></div></body></html>'''
open('overlay.html','w').write(html); print(W,H)
