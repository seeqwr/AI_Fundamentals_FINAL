// The same floor stencils are stamped onto the 2D deck and the WebGL room planes.
class SectorArt {
    static stencils=new Map();

    static stencil(design){
        if(this.stencils.has(design.id))return this.stencils.get(design.id);
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=256;
        const ctx=canvas.getContext('2d');
        ctx.translate(128,128);
        ctx.strokeStyle=ctx.fillStyle=design.trim;
        ctx.lineWidth=4;
        const line=(...points)=>{
            ctx.beginPath();ctx.moveTo(...points[0]);
            for(const p of points.slice(1))ctx.lineTo(...p);
            ctx.stroke();
        };
        if(design.id==='basin'){
            for(let i=0;i<3;i++){
                ctx.rotate(2*Math.PI/3);
                ctx.beginPath();ctx.arc(0,0,90,.09,1.84);ctx.stroke();
                ctx.beginPath();ctx.arc(0,0,73,.09,.95);ctx.stroke();
                ctx.fillRect(63,-3,35,6);
            }
            ctx.strokeRect(-9,-9,18,18);
        }else if(design.id==='kiln'){
            for(const side of [-1,1]){
                line([side*99,66],[side*99,-45],[side*79,-65],[side*52,-65]);
                for(let i=0;i<4;i++){
                    const x=side*(14+i*17);
                    line([x,42],[x,-25],[x+side*11,-36]);
                }
            }
        }else{
            for(const side of [-1,1]){
                for(let i=0;i<3;i++){
                    const y=-56+i*24, pin=side*(27+i*12);
                    line([side*99,y],[pin,y],[pin-side*13,y+13],[pin-side*13,54]);
                    ctx.fillRect(pin-side*13-4,55,8,8);
                }
            }
        }
        this.stencils.set(design.id,canvas);
        return canvas;
    }
}
