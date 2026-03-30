// BCBS Home State Identifier — Application Logic
// Copyright 2026. All rights reserved.
// Data updated: March 2026

window.addEventListener('scroll',function(){document.getElementById('gtt').style.display=window.scrollY>300?'flex':'none'});

function sw(t){['sub','dir','pfx'].forEach(function(x){document.getElementById('p-'+x).classList.toggle('hd',x!==t);document.getElementById('t-'+x).classList.toggle('on',x===t)});if(t==='dir')fd()}

function bd(v){return v?'<span class="ok">Available</span>':'<span class="no">Not Available</span>'}
function bds(v){return v?'<span class="ok">\u2713</span>':'<span class="no">\u2717</span>'}

var VALID_PFX=/^[A-Z2-9]{3}$/;
var HAS_INVALID=/[^A-Za-z2-9]/;
var HAS_01=/[01]/;

function vi(){
var el=document.getElementById('vm');
var raw=document.getElementById('sId').value.trim();
if(!raw){el.innerHTML='';return}
if(raw.length<3){el.innerHTML='<div class="vm vm-w">Enter at least 3 characters</div>';return}
var pfx=raw.substring(0,3).toUpperCase();
if(HAS_INVALID.test(pfx)){el.innerHTML='<div class="vm vm-e">\u2717 BCBS prefixes contain only letters (A-Z) and digits (2-9). No spaces or special characters.</div>';return}
if(HAS_01.test(pfx)){el.innerHTML='<div class="vm vm-e">\u2717 BCBS prefixes do not use digits 0 or 1 (to avoid confusion with letters O and I).</div>';return}
if(!VALID_PFX.test(pfx)){el.innerHTML='<div class="vm vm-e">\u2717 Not a valid BCBS prefix format. Expected 3 characters using A-Z and 2-9.</div>';return}
var idx=P[pfx];
if(idx===undefined){el.innerHTML='<div class="vm vm-e">\u2717 Prefix \u201c'+pfx+'\u201d is not a recognized BCBS prefix. This may be a non-BCBS payer (Aetna, Cigna, UHC, etc.).</div>';return}
var plan=N[idx];
el.innerHTML='<div class="vm vm-ok">\u2713 BCBS prefix recognized \u2014 '+plan[0]+' ('+plan[1]+')</div>';
}

function avSummary(planName){
var avs=AV[planName];var has275=A275.has(planName);
if(!avs||!avs.length)return{has270:false,hasPa:false,hasRef:false,has275:has275,pids:[]};
var has270=false,hasPa=false,hasRef=false,pids=[];
avs.forEach(function(a){pids.push(a.p);if(a.t.e270)has270=true;if(a.t.pa_in||a.t.pa_out)hasPa=true;if(a.t.ref)hasRef=true});
return{has270:has270,hasPa:hasPa,hasRef:hasRef,has275:has275,pids:pids};
}

function avTable(planName){
var avs=AV[planName];var has275=A275.has(planName);
if(!avs||!avs.length){
var plan=null;for(var i=0;i<N.length;i++){if(N[i][0]===planName){plan=N[i];break}}
var url=plan?plan[3]:'';
return '<div class="al al-w" style="margin-top:8px">Not supported via Availity REST API.'+(url?' Submit via <a href="'+url+'" target="_blank">payer portal</a>.':'')+'</div>';
}
var h='<table class="avtbl"><tr><th>Availity ID</th><th>270 Elig</th><th>278 Inpatient</th><th>278 Outpatient</th><th>278 Referral</th><th>275 Attach</th></tr>';
avs.forEach(function(av){
var e=av.t.e270!==undefined?bd(av.t.e270):'<span class="no">Not Available</span>';
var pi=av.t.pa_in!==undefined?bd(av.t.pa_in):'<span class="no">Not Available</span>';
var po=av.t.pa_out!==undefined?bd(av.t.pa_out):'<span class="no">Not Available</span>';
var r=av.t.ref!==undefined?bd(av.t.ref):'<span class="no">Not Available</span>';
var a5=has275?'<span class="at">Available</span>':'<span class="no">Not Available</span>';
h+='<tr><td class="mono" style="font-size:14px">'+av.p+'</td><td>'+e+'</td><td>'+pi+'</td><td>'+po+'</td><td>'+r+'</td><td>'+a5+'</td></tr>';
});
h+='</table>';return h;
}

function prefixLink(planName,count){
return '<a href="javascript:void(0)" onclick="event.stopPropagation();showPfx(\''+planName.replace(/'/g,"\\'")+'\')\" style="text-decoration:none;border-bottom:1px dashed var(--p)">'+count+' prefixes</a>';
}

function showPfx(planName){
var raw=PP[planName];
if(!raw){alert('No prefix data for this plan');return}
document.getElementById('pfxModalTitle').textContent=planName+' \u2014 Prefixes';
var groups=raw.split('|');
var h='';var total=0;
groups.forEach(function(g){
var prefixes=g.split(',');
total+=prefixes.length;
var firstChar=prefixes[0][0];
h+='<div class="pfx-group"><div class="pfx-letter">'+firstChar+' <span class="pfx-count">('+prefixes.length+')</span></div>';
h+='<div class="pfx-grid">';
prefixes.forEach(function(p){h+='<span class="pfx-tag">'+p+'</span>'});
h+='</div></div>';
});
document.getElementById('pfxModalBody').innerHTML='<div style="font-size:13px;color:var(--s);margin-bottom:10px">Total: '+total+' prefixes (alphabetic + alphanumeric)</div>'+h;
document.getElementById('pfxModal').classList.add('open');
document.body.style.overflow='hidden';
}

function closePfx(){document.getElementById('pfxModal').classList.remove('open');document.body.style.overflow=''}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closePfx()});

function lu(){
var raw=document.getElementById('sId').value.trim().replace(/\s+/g,'');
var el=document.getElementById('sr');
if(raw.length<3){el.innerHTML='<div class="al al-e">Enter at least 3 characters.</div>';return}
var pfx=raw.substring(0,3).toUpperCase();
if(HAS_INVALID.test(pfx)||HAS_01.test(pfx)||!VALID_PFX.test(pfx)){
el.innerHTML='<div class="al al-e">Not a valid BCBS prefix format. BCBS prefixes are 3 characters using letters A-Z and digits 2-9 (no 0 or 1).</div>';return}
var idx=P[pfx];
if(idx===undefined){
el.innerHTML='<div class="al al-e">Prefix <strong>\u201c'+pfx+'\u201d</strong> is not a recognized BCBS prefix. This member ID likely belongs to a non-BCBS payer (Aetna, Cigna, UnitedHealthcare, etc.).</div>';return}
var plan=N[idx];
var sum=avSummary(plan[0]);
var h='<div class="rc">';
h+='<div class="fl row" style="gap:12px;margin-bottom:14px"><div class="pb"><div class="l">Prefix</div><div class="v">'+pfx+'</div></div>';
h+='<div style="font-size:20px;color:var(--s)">\u2192</div>';
h+='<div><div style="font-size:19px;font-weight:800;color:var(--pd)">'+plan[0]+'</div>';
h+='<div style="font-size:13px;color:var(--s);margin-top:2px">Home State: <strong>'+plan[1]+'</strong> \u2022 '+prefixLink(plan[0],plan[2])+' \u2022 <a href="'+plan[3]+'" target="_blank">Website \u2197</a></div></div></div>';
h+='<div class="fl row" style="gap:5px;margin-bottom:12px">';
h+=(sum.has270?'<span class="ok">270 Elig</span>':'<span class="no">270 Elig</span>');
h+=(sum.hasPa?'<span class="ok">278 PA</span>':'<span class="no">278 PA</span>');
h+=(sum.hasRef?'<span class="ok">278 Ref</span>':'<span class="no">278 Ref</span>');
h+=(sum.has275?'<span class="at">275 Attach</span>':'<span class="no">275 Attach</span>');
h+='</div>';
h+=avTable(plan[0]);
h+='<div class="al al-i mt">All Prior Authorization and Referral submissions for this member must be directed to <strong>'+plan[0]+'</strong> ('+plan[1]+').</div>';
h+='</div>';
el.innerHTML=h;
}

function fd(){
var s=document.getElementById('ds').value.toLowerCase();
var st=document.getElementById('df').value;
var f=N.filter(function(p){if(st&&p[1]!==st)return false;if(s&&p[0].toLowerCase().indexOf(s)===-1)return false;return true});
f.sort(function(a,b){return b[2]-a[2]});
var h='';
f.forEach(function(p,i){
var sum=avSummary(p[0]);
var id='ac'+i;
h+='<div class="pr">';
h+='<div class="acc-toggle fl row" style="justify-content:space-between" onclick="ta(\''+id+'\')">';
h+='<div><div style="font-size:15px;font-weight:700">'+p[0]+'</div>';
h+='<div style="font-size:13px;color:var(--s);margin-top:2px">'+p[1]+' \u2022 '+prefixLink(p[0],p[2])+'</div></div>';
h+='<div class="fl row" style="gap:4px">';
h+=(sum.hasPa?'<span class="ok">PA</span>':'<span class="no">PA</span>');
h+=(sum.hasRef?'<span class="ok">Ref</span>':'<span class="no">Ref</span>');
h+=(sum.has270?'<span class="ok">270</span>':'<span class="no">270</span>');
h+=(sum.has275?'<span class="at">275</span>':'<span class="no">275</span>');
h+='</div></div>';
h+='<div class="acc-body" id="'+id+'">'+avTable(p[0])+'</div>';
h+='</div>';
});
document.getElementById('dr').innerHTML=h;
document.getElementById('dd').textContent=f.length+' plans';
}

function ta(id){document.getElementById(id).classList.toggle('open')}

function sp(){
var input=document.getElementById('pi');
input.value=input.value.toUpperCase().replace(/[^A-Z2-9]/g,'');
var v=input.value;
var el=document.getElementById('px'),st=document.getElementById('pst');
if(!v.length){el.innerHTML='';st.textContent='';return}
var m=[];var keys=Object.keys(P);
for(var i=0;i<keys.length;i++){if(keys[i].indexOf(v)===0)m.push([keys[i],N[P[keys[i]]]])}
m.sort(function(a,b){return a[0]<b[0]?-1:1});
st.textContent=m.length+' prefix'+(m.length!==1?'es':'')+' found'+(m.length>200?' (showing first 200)':'');
var sh=m.slice(0,200);
var h='<table class="ptbl"><tr><th>Prefix</th><th>BCBS Plan</th><th>State</th><th>Availity ID</th><th>270</th><th>PA</th><th>Ref</th><th>275</th></tr>';
sh.forEach(function(x){
var sum=avSummary(x[1][0]);
h+='<tr><td class="mono">'+x[0]+'</td><td>'+x[1][0]+'</td><td>'+x[1][1]+'</td>';
h+='<td class="mono" style="font-size:12px">'+(sum.pids.length?sum.pids.join(', '):'\u2014')+'</td>';
h+='<td>'+bds(sum.has270)+'</td><td>'+bds(sum.hasPa)+'</td><td>'+bds(sum.hasRef)+'</td>';
h+='<td>'+(sum.has275?'<span class="at">\u2713</span>':bds(false))+'</td></tr>';
});
h+='</table>';el.innerHTML=h;
}

(function(){var ss=[];var seen={};N.forEach(function(p){if(!seen[p[1]]){seen[p[1]]=1;ss.push(p[1])}});ss.sort();var sel=document.getElementById('df');ss.forEach(function(s){var o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o)})})();
