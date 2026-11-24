# Dessine les deux logos de l'app d'après le tableau des épisodes : python3 electron/build/logo.py electron/build
# icon.png (arrondi : macOS) et icon-carre.png (carré plein : Windows, Linux)
import sys
from PIL import Image, ImageDraw
def logo(chemin, rangs=6, marge_ext=0.09, arrondi=0.2):
    N=4096; img=Image.new('RGBA',(N,N),(0,0,0,0)); d=ImageDraw.Draw(img)
    m=int(N*marge_ext)
    if arrondi: d.rounded_rectangle([m,m,N-m,N-m], radius=int(N*arrondi), fill=(12,12,12,255))
    else: d.rectangle([m,m,N-m,N-m], fill=(12,12,12,255))
    cote=N-2*m
    x0, x1 = m+cote*0.08, N-m-cote*0.08
    y0, y1 = m+cote*0.11, N-m-cote*0.11
    W=x1-x0; h=(y1-y0)/rangs
    longueurs=[0.92,0.74,0.85,0.66,0.95,0.80,0.72,0.88]
    for r in range(rangs):
        y=y0+r*h; pad=h*0.13; top=y+pad; bot=y+h-pad; H=bot-top
        if r: d.line([x0,y,x1,y], fill=(36,36,36,255), width=int(N*0.004))
        def col(a,b,c,rr=0): d.rounded_rectangle([x0+W*a, top, x0+W*b, bot], radius=int(rr), fill=c)
        ly=(top+bot)/2; lh=H*0.2
        d.rounded_rectangle([x0, ly-lh, x0+W*(0.33*longueurs[r%8]), ly+lh], radius=int(lh), fill=(118,118,112,255))   # titre
        col(0.36,0.425,(96,124,180,255))           # S1
        col(0.425,0.49,(74,96,140,255))            # n°
        col(0.505,0.615,(221,226,196,255))         # jet
        d.rounded_rectangle([x0+W*0.63, top+H*0.16, x0+W*0.73, top+H*0.30], radius=int(lh*0.6), fill=(103,230,180,255))  # avancement
        d.rounded_rectangle([x0+W*0.63, top+H*0.55, x0+W*0.70, top+H*0.72], radius=int(lh*0.6), fill=(150,150,145,255))
        col(0.745,0.81,(77,105,235,255))           # pages
        col(0.825,0.9,(30,30,30,255), H*0.15)      # durée
        if r < 3: col(0.915,1.0,(110,240,210,255), H*0.25)   # OK
    img.resize((1024,1024), Image.LANCZOS).save(chemin)
S=sys.argv[1]
logo(S+'/icon.png')
logo(S+'/icon-carre.png', marge_ext=0, arrondi=0)
