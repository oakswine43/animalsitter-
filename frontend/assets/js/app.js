/* animalsitter.co — HTML/CSS/JS app (localStorage)
   - No demo sitters are created automatically.
   - Everything starts empty until users apply / admin approves, etc.
   - Later you can replace the Storage layer with API + MySQL.

   Pages:
   - index.html (Home)
   - swipe.html (Swipe)
   - pets.html (Pets)
   - dashboard.html (Dashboard)
   - profile.html (Profile)
*/

(function(){
  const KEY = "animalsitter_state_v2";

  const Roles = Object.freeze({
    CLIENT: "CLIENT",
    SITTER: "SITTER",
    EMPLOYEE: "EMPLOYEE",
    ADMIN: "ADMIN",
  });

  const SitterVerification = Object.freeze({
    NOT_SUBMITTED: "NOT_SUBMITTED",
    PENDING: "PENDING",
    APPROVED: "APPROVED",
    DENIED: "DENIED",
  });

  function nowIso(){ return new Date().toISOString(); }
  function uid(){
    // stable-ish unique id for local only
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now();
  }

  function load(){
    const raw = localStorage.getItem(KEY);
    if(raw){
      try { return JSON.parse(raw); } catch(e){ /* ignore */ }
    }
    const initial = {
      currentUserId: null,
      users: [], // {id,email,firstName,lastName,phone,role,createdAt}
      sitterProfiles: [], // {userId,bio,experienceYears,isActive,verificationStatus,approvedBy,approvedAt,photoDataUrl,verifyPhotoDataUrl}
      sitterLocations: [], // {userId,xPct,yPct,lastSeenAt}
      sitterReactions: [], // {id,fromUserId,sitterUserId,reaction,createdAt} reaction LIKE/DISLIKE
      reviews: [], // {id,sitterUserId,authorUserId,rating,comment,createdAt,likes:[],dislikes:[]}
      reviewComments: [], // {id,reviewId,authorUserId,body,createdAt}
      posts: [], // {id,authorUserId,imageDataUrl,caption,createdAt,likes:[],dislikes:[]}
      postComments: [], // {id,postId,authorUserId,body,createdAt}
      pets: [], // {id,ownerUserId,name,type,age,needs,photoDataUrl,createdAt}
      bookings: [], // {id,clientUserId,sitterUserId,petId,start,end,status,createdAt}
      messages: [], // {id,fromUserId,toUserId,body,createdAt}
    };
    save(initial);
    return initial;
  }

  function save(state){
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function setState(mutator){
    const s = load();
    mutator(s);
    save(s);
    return s;
  }

  function getState(){ return load(); }

  // ---------------------------
  // UI helpers
  // ---------------------------
  function $(sel, root=document){ return root.querySelector(sel); }
  function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function escapeHtml(str){
    return (str ?? "").toString()
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function toast(msg){
    const el = $("#toast");
    if(!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(()=>el.classList.remove("show"), 2400);
  }

  function formatWhen(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString();
    }catch(e){ return iso; }
  }

  function starDisplay(avg){
    const full = Math.floor(avg);
    const half = (avg - full) >= 0.5;
    let out = "";
    for(let i=1;i<=5;i++){
      if(i<=full) out += "★";
      else if(i===full+1 && half) out += "★";
      else out += "☆";
    }
    return out;
  }

  function getCurrentUser(){
    const s = getState();
    return s.users.find(u => u.id === s.currentUserId) || null;
  }

  function requireUser(){
    const u = getCurrentUser();
    if(!u){
      toast("Please sign in first (top right).");
      return null;
    }
    return u;
  }

  function roleIs(u, ...roles){
    return !!u && roles.includes(u.role);
  }

  // ---------------------------
  // Auth / session (local)
  // ---------------------------
  function signIn(email){
    email = (email || "").trim().toLowerCase();
    if(!email) return;

    setState(s => {
      let u = s.users.find(x => x.email === email);
      if(!u){
        u = {
          id: uid(),
          email,
          firstName: "Joshua",
          lastName: "Walker",
          phone: "",
          role: Roles.CLIENT,
          createdAt: nowIso(),
        };
        s.users.push(u);
      }
      s.currentUserId = u.id;
    });

    toast("Signed in.");
    renderAll();
  }

  function signOut(){
    setState(s => { s.currentUserId = null; });
    toast("Signed out.");
    renderAll();
  }

  // For local testing only: allow admin/employee to elevate themselves.
  function setMyRole(role){
    setState(s => {
      const u = s.users.find(x => x.id === s.currentUserId);
      if(!u) return;
      if(!Object.values(Roles).includes(role)) return;
      u.role = role;
    });
    toast("Role updated.");
    renderAll();
  }

  // ---------------------------
  // Sitters
  // ---------------------------
  function getSitterProfile(userId){
    const s = getState();
    return s.sitterProfiles.find(p => p.userId === userId) || null;
  }

  function upsertSitterLocation(userId){
    setState(s => {
      const ex = s.sitterLocations.find(l => l.userId === userId);
      const fresh = {
        userId,
        xPct: Math.max(6, Math.min(94, Math.floor(Math.random()*88)+6)),
        yPct: Math.max(8, Math.min(90, Math.floor(Math.random()*82)+8)),
        lastSeenAt: nowIso(),
      };
      if(ex){
        ex.xPct = fresh.xPct;
        ex.yPct = fresh.yPct;
        ex.lastSeenAt = fresh.lastSeenAt;
      } else {
        s.sitterLocations.push(fresh);
      }
    });
  }

  function getActiveSitters(){
    const s = getState();
    const cutoff = Date.now() - 10*60*1000; // last 10 minutes
    return s.sitterProfiles
      .filter(p => p.verificationStatus === SitterVerification.APPROVED && p.isActive === true)
      .map(p => {
        const u = s.users.find(x => x.id === p.userId);
        const loc = s.sitterLocations.find(l => l.userId === p.userId);
        const seenOk = loc ? (new Date(loc.lastSeenAt).getTime() >= cutoff) : false;
        return u && loc && seenOk ? ({ user: u, profile: p, loc }) : null;
      })
      .filter(Boolean);
  }

  function avgRating(sitterUserId){
    const s = getState();
    const rs = s.reviews.filter(r => r.sitterUserId === sitterUserId);
    if(rs.length === 0) return 0;
    const sum = rs.reduce((a,r)=>a + (Number(r.rating)||0), 0);
    return Math.round((sum/rs.length)*10)/10;
  }

  function applyToBeSitter({bio, experienceYears, photoDataUrl, verifyPhotoDataUrl}){
    const me = requireUser();
    if(!me) return;

    // submit/update sitter profile (pending)
    setState(s => {
      let p = s.sitterProfiles.find(x => x.userId === me.id);
      if(!p){
        p = {
          userId: me.id,
          bio: (bio||"").trim(),
          experienceYears: Math.max(0, Number(experienceYears||0)),
          isActive: false,
          verificationStatus: SitterVerification.PENDING,
          approvedBy: null,
          approvedAt: null,
          photoDataUrl: photoDataUrl || "",
          verifyPhotoDataUrl: verifyPhotoDataUrl || "",
        };
        s.sitterProfiles.push(p);
      } else {
        p.bio = (bio||"").trim();
        p.experienceYears = Math.max(0, Number(experienceYears||0));
        p.verificationStatus = SitterVerification.PENDING;
        if(photoDataUrl) p.photoDataUrl = photoDataUrl;
        if(verifyPhotoDataUrl) p.verifyPhotoDataUrl = verifyPhotoDataUrl;
        p.isActive = false;
      }
    });

    toast("Application submitted (Pending approval).");
    renderAll();
  }

  function approveOrDenySitter(targetUserId, approve){
    const me = requireUser();
    if(!me) return;
    if(!roleIs(me, Roles.ADMIN, Roles.EMPLOYEE)){
      toast("Only Admin/Employee can approve sitters.");
      return;
    }

    setState(s => {
      const p = s.sitterProfiles.find(x => x.userId === targetUserId);
      if(!p) return;

      p.verificationStatus = approve ? SitterVerification.APPROVED : SitterVerification.DENIED;
      p.approvedBy = me.id;
      p.approvedAt = nowIso();
      p.isActive = false;

      // On approve, user role becomes SITTER (read-only for them)
      if(approve){
        const u = s.users.find(x => x.id === targetUserId);
        if(u) u.role = Roles.SITTER;
        // create location when they later go active
        upsertSitterLocation(targetUserId);
      }
    });

    toast(approve ? "Sitter approved." : "Sitter denied.");
    renderAll();
  }

  function setSitterActive(active){
    const me = requireUser();
    if(!me) return;
    if(me.role !== Roles.SITTER){
      toast("Only approved sitters can go active.");
      return;
    }

    setState(s => {
      const p = s.sitterProfiles.find(x => x.userId === me.id);
      if(!p || p.verificationStatus !== SitterVerification.APPROVED) return;
      p.isActive = !!active;
    });

    if(active) upsertSitterLocation(me.id);
    toast(active ? "You are now active." : "You are now inactive.");
    renderAll();
  }

  // ---------------------------
  // Reviews / comments
  // ---------------------------
  function addOrUpdateReview(sitterUserId, rating, comment){
    const me = requireUser();
    if(!me) return;

    rating = Math.max(1, Math.min(5, Number(rating||5)));
    comment = (comment || "").trim();

    setState(s => {
      let r = s.reviews.find(x => x.sitterUserId === sitterUserId && x.authorUserId === me.id);
      if(!r){
        r = { id: uid(), sitterUserId, authorUserId: me.id, rating, comment, createdAt: nowIso(), likes: [], dislikes: [] };
        s.reviews.push(r);
      } else {
        r.rating = rating;
        r.comment = comment;
      }
    });

    toast("Review saved.");
    renderAll();
  }

  function toggleReactArray(arr, userId){
    const i = arr.indexOf(userId);
    if(i>=0) arr.splice(i,1);
    else arr.push(userId);
  }

  function reactReview(reviewId, type){
    const me = requireUser();
    if(!me) return;

    setState(s => {
      const r = s.reviews.find(x => x.id === reviewId);
      if(!r) return;

      if(type === "like"){
        toggleReactArray(r.likes, me.id);
        const di = r.dislikes.indexOf(me.id);
        if(di>=0) r.dislikes.splice(di,1);
      } else if(type === "dislike"){
        toggleReactArray(r.dislikes, me.id);
        const li = r.likes.indexOf(me.id);
        if(li>=0) r.likes.splice(li,1);
      }
    });

    renderAll();
  }

  function addReviewComment(reviewId, body){
    const me = requireUser();
    if(!me) return;

    body = (body||"").trim();
    if(!body) return;

    setState(s => {
      s.reviewComments.push({ id: uid(), reviewId, authorUserId: me.id, body, createdAt: nowIso() });
    });

    toast("Comment added.");
    renderAll();
  }

  // ---------------------------
  // Gallery posts (Home)
  // ---------------------------
  function addPost(imageDataUrl, caption){
    const me = requireUser();
    if(!me) return;

    caption = (caption||"").trim();

    setState(s => {
      s.posts.unshift({
        id: uid(),
        authorUserId: me.id,
        imageDataUrl: imageDataUrl || "",
        caption,
        createdAt: nowIso(),
        likes: [],
        dislikes: [],
      });
    });

    toast("Post created.");
    renderAll();
  }

  function deletePost(postId){
    const me = requireUser();
    if(!me) return;

    setState(s => {
      const p = s.posts.find(x => x.id === postId);
      if(!p) return;
      if(p.authorUserId !== me.id) return; // only creator
      s.posts = s.posts.filter(x => x.id !== postId);
      s.postComments = s.postComments.filter(c => c.postId !== postId);
    });

    toast("Post removed.");
    renderAll();
  }

  function reactPost(postId, type){
    const me = requireUser();
    if(!me) return;

    setState(s => {
      const p = s.posts.find(x => x.id === postId);
      if(!p) return;

      if(type === "like"){
        toggleReactArray(p.likes, me.id);
        const di = p.dislikes.indexOf(me.id);
        if(di>=0) p.dislikes.splice(di,1);
      } else if(type === "dislike"){
        toggleReactArray(p.dislikes, me.id);
        const li = p.likes.indexOf(me.id);
        if(li>=0) p.likes.splice(li,1);
      }
    });

    renderAll();
  }

  function addPostComment(postId, body){
    const me = requireUser();
    if(!me) return;

    body = (body||"").trim();
    if(!body) return;

    setState(s => {
      s.postComments.push({ id: uid(), postId, authorUserId: me.id, body, createdAt: nowIso() });
    });

    toast("Comment added.");
    renderAll();
  }

  // ---------------------------
  // Swipe page
  // ---------------------------
  function swipeReact(sitterUserId, reaction){
    const me = requireUser();
    if(!me) return;
    if(me.id === sitterUserId){
      toast("You can’t swipe on yourself.");
      return;
    }

    setState(s => {
      const existing = s.sitterReactions.find(x => x.fromUserId === me.id && x.sitterUserId === sitterUserId);
      if(existing) existing.reaction = reaction;
      else s.sitterReactions.push({ id: uid(), fromUserId: me.id, sitterUserId, reaction, createdAt: nowIso() });
    });

    renderAll();
  }

  function getLikedSitters(){
    const s = getState();
    const me = s.currentUserId;
    if(!me) return [];
    const likedIds = s.sitterReactions
      .filter(x => x.fromUserId === me && x.reaction === "LIKE")
      .map(x => x.sitterUserId);

    return likedIds
      .map(id => {
        const u = s.users.find(x => x.id === id);
        const p = s.sitterProfiles.find(x => x.userId === id);
        return (u && p && p.verificationStatus === SitterVerification.APPROVED) ? ({ user:u, profile:p, avg: avgRating(id) }) : null;
      })
      .filter(Boolean);
  }

  // ---------------------------
  // Pets page
  // ---------------------------
  function addPet({name,type,age,needs,photoDataUrl}){
    const me = requireUser();
    if(!me) return;

    name = (name||"").trim();
    if(!name){ toast("Pet name is required."); return; }

    setState(s => {
      s.pets.unshift({
        id: uid(),
        ownerUserId: me.id,
        name,
        type: type || "OTHER",
        age: (age||"").toString().trim(),
        needs: (needs||"").trim(),
        photoDataUrl: photoDataUrl || "",
        createdAt: nowIso(),
      });
    });

    toast("Pet added.");
    renderAll();
  }

  function updatePet(petId, patch){
    const me = requireUser();
    if(!me) return;

    setState(s => {
      const p = s.pets.find(x => x.id === petId);
      if(!p) return;
      if(p.ownerUserId !== me.id) return;
      Object.assign(p, patch);
    });

    toast("Pet updated.");
    renderAll();
  }

  function deletePet(petId){
    const me = requireUser();
    if(!me) return;

    setState(s => {
      const p = s.pets.find(x => x.id === petId);
      if(!p) return;
      if(p.ownerUserId !== me.id) return;
      s.pets = s.pets.filter(x => x.id !== petId);
    });

    toast("Pet removed.");
    renderAll();
  }

  // ---------------------------
  // Dashboard (basic)
  // ---------------------------
  function sendMessage(toUserId, body){
    const me = requireUser();
    if(!me) return;
    body = (body||"").trim();
    if(!body) return;

    setState(s => {
      s.messages.unshift({ id: uid(), fromUserId: me.id, toUserId, body, createdAt: nowIso() });
    });

    toast("Message sent.");
    renderAll();
  }

  // ---------------------------
  // File input helper
  // ---------------------------
  function readFileAsDataURL(file){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---------------------------
  // Header / nav render
  // ---------------------------
  function renderHeader(){
    const s = getState();
    const u = getCurrentUser();

    const who = $("#who");
    const role = $("#role");
    const signinForm = $("#signinForm");
    const emailInput = $("#emailInput");
    const signoutBtn = $("#signoutBtn");
    const roleSelect = $("#roleSelect");
    const roleHint = $("#roleHint");

    if(!who) return;

    if(u){
      who.textContent = `${u.firstName} ${u.lastName} (${u.email})`;
      role.textContent = u.role;
      signoutBtn.style.display = "inline-flex";
      signinForm.style.display = "none";

      // allow manual role change for local testing only (you can remove later)
      roleSelect.value = u.role;
      roleSelect.disabled = false;
      roleHint.textContent = (u.role === Roles.CLIENT)
        ? "Tip: set yourself to ADMIN/EMPLOYEE to approve sitters (local test only)."
        : "Role set for local testing (later controlled by backend).";
    } else {
      who.textContent = "Not signed in";
      role.textContent = "—";
      signoutBtn.style.display = "none";
      signinForm.style.display = "flex";
      if(emailInput) emailInput.value = "";
      roleSelect.value = Roles.CLIENT;
      roleSelect.disabled = true;
      roleHint.textContent = "Sign in to interact (create pets, post, swipe, apply).";
    }
  }

  function wireHeader(){
    const signinForm = $("#signinForm");
    const emailInput = $("#emailInput");
    const signoutBtn = $("#signoutBtn");
    const roleSelect = $("#roleSelect");

    if(signinForm){
      signinForm.addEventListener("submit", (e)=>{
        e.preventDefault();
        signIn(emailInput.value);
      });
    }
    if(signoutBtn){
      signoutBtn.addEventListener("click", ()=>signOut());
    }
    if(roleSelect){
      roleSelect.addEventListener("change", ()=>{
        const u = getCurrentUser();
        if(!u) return;
        setMyRole(roleSelect.value);
      });
    }
  }

  // ---------------------------
  // Page renders
  // ---------------------------
  function renderHome(){
    const active = getActiveSitters();

    // Map
    const map = $("#activeMap");
    if(map){
      map.innerHTML = `
        <div class="label">
          Active sitters: <b>${active.length}</b>
          ${active.length===0 ? " · No active sitters at the moment." : ""}
        </div>
      `;
      active.forEach(a => {
        const pin = document.createElement("div");
        pin.className = "pin";
        pin.style.left = `${a.loc.xPct}%`;
        pin.style.top  = `${a.loc.yPct}%`;
        map.appendChild(pin);
      });
    }

    // Active sitters list
    const list = $("#activeSittersList");
    if(list){
      if(active.length === 0){
        list.innerHTML = `<div class="notice">No active sitters at the moment.</div>`;
      } else {
        list.innerHTML = active.map(a => {
          const avg = avgRating(a.user.id);
          const photo = a.profile.photoDataUrl || "";
          return `
            <div class="item">
              <div class="spread">
                <div class="row">
                  <img class="avatar" alt="sitter" src="${photo || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTAiIGhlaWdodD0iOTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjkwIiBoZWlnaHQ9IjkwIiByeD0iMTYiIGZpbGw9IiMyMDIwMmEiLz48Y2lyY2xlIGN4PSI0NSIgY3k9IjM4IiByPSIxNiIgZmlsbD0iIzQ0NDQ1NSIvPjxyZWN0IHg9IjIwIiB5PSI1NiIgd2lkdGg9IjUwIiBoZWlnaHQ9IjIyIiByeD0iMTEiIGZpbGw9IiMzMjMyNDAiLz48L3N2Zz4="}" />
                  <div>
                    <div><b>${escapeHtml(a.user.firstName)} ${escapeHtml(a.user.lastName)}</b></div>
                    <div class="muted">${escapeHtml(a.profile.bio || "No bio yet.")}</div>
                    <div class="pill">Experience: ${Number(a.profile.experienceYears)||0} yrs</div>
                    <div class="pill">Rating: <span class="star-display">${escapeHtml(starDisplay(avg))}</span> <span class="muted">(${avg || 0})</span></div>
                  </div>
                </div>
                <div class="row">
                  <button class="btn small primary" data-action="home-view" data-id="${a.user.id}">View</button>
                  <button class="btn small" data-action="home-msg" data-id="${a.user.id}">Message</button>
                </div>
              </div>
            </div>
          `;
        }).join("");
      }

      list.onclick = (e) => {
        const btn = e.target.closest("button");
        if(!btn) return;
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if(action === "home-view"){
          localStorage.setItem("animalsitter_view_sitter", id);
          location.href = "profile.html#viewSitter";
        }
        if(action === "home-msg"){
          localStorage.setItem("animalsitter_msg_to", id);
          location.href = "dashboard.html#messages";
        }
      };
    }

    // Ratings section
    const ratings = $("#ratingsSection");
    if(ratings){
      const s = getState();
      const activeApproved = s.sitterProfiles
        .filter(p => p.verificationStatus === SitterVerification.APPROVED)
        .map(p => {
          const u = s.users.find(x => x.id === p.userId);
          if(!u) return null;
          return { user:u, profile:p, avg: avgRating(u.id) };
        })
        .filter(Boolean)
        .sort((a,b)=> (b.avg||0) - (a.avg||0))
        .slice(0, 6);

      if(activeApproved.length === 0){
        ratings.innerHTML = `<div class="notice">No rated sitters yet. When sitters are approved and users leave reviews, they’ll appear here.</div>`;
      } else {
        // tabs are sitters
        const tabs = activeApproved.map((x,i)=>`
          <button class="tab ${i===0?"active":""}" data-tab="${x.user.id}">
            ${escapeHtml(x.user.firstName)} (${x.avg || 0})
          </button>
        `).join("");

        ratings.innerHTML = `
          <div class="spread">
            <div>
              <h3>Ratings</h3>
              <div class="muted">Preview sitter profiles + reviews. Like/dislike/comment and rate 1–5 stars.</div>
            </div>
            <div class="pill">Tip: Sign in to rate</div>
          </div>
          <div class="tabs">${tabs}</div>
          <div id="ratingPanel"></div>
        `;

        function renderPanel(sitterId){
          const sitter = activeApproved.find(x => x.user.id === sitterId);
          if(!sitter) return;
          const s = getState();
          const rs = s.reviews.filter(r => r.sitterUserId === sitterId)
            .sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt))
            .slice(0, 5);

          const me = getCurrentUser();
          const myReview = me ? s.reviews.find(r => r.sitterUserId===sitterId && r.authorUserId===me.id) : null;

          const photo = sitter.profile.photoDataUrl || "";
          $("#ratingPanel").innerHTML = `
            <div class="item">
              <div class="spread">
                <div class="row">
                  <img class="avatar" alt="sitter" src="${photo || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTAiIGhlaWdodD0iOTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjkwIiBoZWlnaHQ9IjkwIiByeD0iMTYiIGZpbGw9IiMyMDIwMmEiLz48Y2lyY2xlIGN4PSI0NSIgY3k9IjM4IiByPSIxNiIgZmlsbD0iIzQ0NDQ1NSIvPjxyZWN0IHg9IjIwIiB5PSI1NiIgd2lkdGg9IjUwIiBoZWlnaHQ9IjIyIiByeD0iMTEiIGZpbGw9IiMzMjMyNDAiLz48L3N2Zz4="}" />
                  <div>
                    <div><b>${escapeHtml(sitter.user.firstName)} ${escapeHtml(sitter.user.lastName)}</b></div>
                    <div class="muted">${escapeHtml(sitter.profile.bio || "No bio yet.")}</div>
                    <div class="pill">Avg rating: <span class="star-display">${escapeHtml(starDisplay(sitter.avg))}</span> <span class="muted">(${sitter.avg || 0})</span></div>
                  </div>
                </div>
                <div class="row">
                  <button class="btn small" data-action="view" data-id="${sitterId}">View Profile</button>
                </div>
              </div>

              <div class="hr"></div>

              <div class="stack">
                <div><b>Your Rating</b> <span class="muted">(one review per user per sitter)</span></div>
                <div class="row" id="myStars"></div>
                <textarea class="textarea" id="myReviewText" placeholder="Write a review...">${escapeHtml(myReview?.comment || "")}</textarea>
                <div class="row">
                  <button class="btn primary" id="saveReviewBtn">Save Review</button>
                </div>
              </div>

              <div class="hr"></div>

              <div class="stack">
                <div><b>Recent Reviews</b></div>
                ${rs.length===0 ? `<div class="notice">No reviews yet for this sitter.</div>` : rs.map(r=>{
                  const author = s.users.find(u => u.id === r.authorUserId);
                  const authorName = author ? `${author.firstName} ${author.lastName}` : "Unknown";
                  const comments = s.reviewComments.filter(c => c.reviewId === r.id)
                    .sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
                  return `
                    <div class="item">
                      <div class="spread">
                        <div>
                          <div><b>${escapeHtml(authorName)}</b> <span class="muted">· ${escapeHtml(formatWhen(r.createdAt))}</span></div>
                          <div class="star-display">${escapeHtml(starDisplay(r.rating))}</div>
                          <div>${escapeHtml(r.comment || "")}</div>
                        </div>
                        <div class="row">
                          <button class="btn small" data-action="r-like" data-id="${r.id}">👍 ${r.likes.length}</button>
                          <button class="btn small" data-action="r-dislike" data-id="${r.id}">👎 ${r.dislikes.length}</button>
                        </div>
                      </div>
                      <div class="hr"></div>
                      <div class="stack">
                        <div class="muted">Comments</div>
                        ${comments.length===0 ? `<div class="muted">No comments yet.</div>` : comments.map(c=>{
                          const au = s.users.find(u => u.id === c.authorUserId);
                          const nm = au ? `${au.firstName} ${au.lastName}` : "Unknown";
                          return `<div class="muted"><b>${escapeHtml(nm)}:</b> ${escapeHtml(c.body)}</div>`;
                        }).join("")}
                        <div class="row">
                          <input class="input" placeholder="Add a comment..." data-review-comment="${r.id}" />
                          <button class="btn small primary" data-action="r-comment" data-id="${r.id}">Post</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>
          `;

          // stars input
          const starWrap = $("#myStars");
          let ratingVal = myReview?.rating || 5;
          starWrap.innerHTML = Array.from({length:5}, (_,i)=>{
            const n = i+1;
            return `<button class="star-btn ${n<=ratingVal?"on":""}" data-star="${n}" title="${n}">${n<=ratingVal?"★":"☆"}</button>`;
          }).join("");

          starWrap.onclick = (e)=>{
            const b = e.target.closest("button[data-star]");
            if(!b) return;
            ratingVal = Number(b.dataset.star);
            renderPanel(sitterId);
            // keep textarea value on re-render
            $("#myReviewText").value = $("#myReviewText").value;
          };

          $("#saveReviewBtn").onclick = ()=>{
            const me = getCurrentUser();
            if(!me){ toast("Sign in to review."); return; }
            const txt = $("#myReviewText").value;
            addOrUpdateReview(sitterId, ratingVal, txt);
          };

          $("#ratingPanel").onclick = (e)=>{
            const btn = e.target.closest("button");
            if(!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;

            if(action === "view"){
              localStorage.setItem("animalsitter_view_sitter", sitterId);
              location.href = "profile.html#viewSitter";
            }
            if(action === "r-like") reactReview(id, "like");
            if(action === "r-dislike") reactReview(id, "dislike");
            if(action === "r-comment"){
              const input = $(`[data-review-comment="${id}"]`);
              addReviewComment(id, input.value);
            }
          };
        }

        // tab switching
        const tabsEl = $all(".tab", ratings);
        tabsEl.forEach(t=>{
          t.onclick = ()=>{
            tabsEl.forEach(x=>x.classList.remove("active"));
            t.classList.add("active");
            renderPanel(t.dataset.tab);
          };
        });

        renderPanel(activeApproved[0].user.id);
      }
    }

    // Gallery
    const gallery = $("#gallery");
    if(gallery){
      const s = getState();
      const me = getCurrentUser();
      const posts = s.posts.slice(0, 12);

      gallery.innerHTML = `
        <div class="spread">
          <div>
            <h3>Gallery</h3>
            <div class="muted">Clients & sitters can post progress updates. Only the creator can delete their post.</div>
          </div>
          <div class="row">
            <input type="file" id="postImage" accept="image/*" />
            <button class="btn primary" id="createPostBtn">Create Post</button>
          </div>
        </div>
        <input class="input" id="postCaption" placeholder="Caption (optional)" />
        <div class="hr"></div>
        ${posts.length===0 ? `<div class="notice">No posts yet. Create the first post!</div>` : `
          <div class="gallery-grid">
            ${posts.map(p=>{
              const u = s.users.find(x=>x.id===p.authorUserId);
              const nm = u ? `${u.firstName} ${u.lastName}` : "Unknown";
              const canDelete = me && me.id === p.authorUserId;
              return `
                <div class="item">
                  ${p.imageDataUrl ? `<img class="post-img" alt="post" src="${p.imageDataUrl}">` : `<div class="post-img"></div>`}
                  <div style="margin-top:8px;">
                    <div><b>${escapeHtml(nm)}</b> <span class="muted">· ${escapeHtml(formatWhen(p.createdAt))}</span></div>
                    <div class="muted">${escapeHtml(p.caption || "")}</div>
                  </div>
                  <div class="row" style="margin-top:10px;">
                    <button class="btn small" data-action="p-like" data-id="${p.id}">👍 ${p.likes.length}</button>
                    <button class="btn small" data-action="p-dislike" data-id="${p.id}">👎 ${p.dislikes.length}</button>
                    ${canDelete ? `<button class="btn small bad" data-action="p-del" data-id="${p.id}">Delete</button>` : ""}
                  </div>
                  <div class="hr"></div>
                  <div class="row">
                    <input class="input" placeholder="Comment..." data-post-comment="${p.id}" />
                    <button class="btn small primary" data-action="p-comment" data-id="${p.id}">Post</button>
                  </div>
                  <div class="stack" style="margin-top:10px;">
                    ${s.postComments.filter(c=>c.postId===p.id).slice(-2).map(c=>{
                      const au = s.users.find(x=>x.id===c.authorUserId);
                      const nm2 = au ? `${au.firstName}` : "Unknown";
                      return `<div class="muted"><b>${escapeHtml(nm2)}:</b> ${escapeHtml(c.body)}</div>`;
                    }).join("")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        `}
      `;

      $("#createPostBtn").onclick = async ()=>{
        const me = getCurrentUser();
        if(!me){ toast("Sign in to post."); return; }
        const file = $("#postImage").files?.[0];
        let dataUrl = "";
        if(file){
          dataUrl = await readFileAsDataURL(file);
        }
        const caption = $("#postCaption").value;
        addPost(dataUrl, caption);
      };

      gallery.onclick = (e)=>{
        const btn = e.target.closest("button");
        if(!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if(action === "p-like") reactPost(id, "like");
        if(action === "p-dislike") reactPost(id, "dislike");
        if(action === "p-del") deletePost(id);
        if(action === "p-comment"){
          const input = $(`[data-post-comment="${id}"]`);
          addPostComment(id, input.value);
        }
      };
    }
  }

  function renderSwipe(){
    const card = $("#swipeCard");
    const liked = $("#likedList");
    const s = getState();
    const me = getCurrentUser();

    const candidates = s.sitterProfiles
      .filter(p => p.verificationStatus === SitterVerification.APPROVED)
      .map(p => {
        const u = s.users.find(x=>x.id===p.userId);
        if(!u) return null;
        return { user:u, profile:p, avg: avgRating(u.id) };
      })
      .filter(Boolean);

    if(card){
      if(!me){
        card.innerHTML = `<div class="notice">Sign in to swipe on sitters.</div>`;
        if(liked) liked.innerHTML = `<div class="notice">Sign in to see liked sitters.</div>`;
        return;
      }

      // pick next candidate not yet swiped, else loop from start
      const swipedIds = s.sitterReactions.filter(r => r.fromUserId===me.id).map(r=>r.sitterUserId);
      const next = candidates.find(c => !swipedIds.includes(c.user.id)) || candidates[0];

      if(!next){
        card.innerHTML = `<div class="notice">No sitters available yet. Approve a sitter in Dashboard (Admin/Employee) once someone applies.</div>`;
      } else {
        const photo = next.profile.photoDataUrl || "";
        card.innerHTML = `
          <div class="item">
            <div class="row">
              <img class="avatar big" alt="sitter" src="${photo || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI0IiBmaWxsPSIjMjAyMDJhIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI0OCIgcj0iMjAiIGZpbGw9IiM0NDQ0NTUiLz48cmVjdCB4PSIyOCIgeT0iNzAiIHdpZHRoPSI2NCIgaGVpZ2h0PSIyOCIgcng9IjE0IiBmaWxsPSIjMzIzMjQwIi8+PC9zdmc+"}" />
              <div>
                <div style="font-size:18px;"><b>${escapeHtml(next.user.firstName)} ${escapeHtml(next.user.lastName)}</b></div>
                <div class="muted">${escapeHtml(next.profile.bio || "No bio yet.")}</div>
                <div class="row" style="margin-top:8px;">
                  <span class="pill">Experience: ${Number(next.profile.experienceYears)||0} yrs</span>
                  <span class="pill">Rating: <span class="star-display">${escapeHtml(starDisplay(next.avg))}</span> <span class="muted">(${next.avg||0})</span></span>
                </div>
              </div>
            </div>
            <div class="hr"></div>
            <div class="row">
              <button class="btn bad" data-action="dislike" data-id="${next.user.id}">Dislike</button>
              <button class="btn good" data-action="like" data-id="${next.user.id}">Like</button>
              <button class="btn" data-action="view" data-id="${next.user.id}">View Profile</button>
            </div>
            <div class="muted" style="margin-top:10px;">Nearby sitters will cycle here (real only, no demo).</div>
          </div>
        `;
      }

      card.onclick = (e)=>{
        const btn = e.target.closest("button");
        if(!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if(action === "like") swipeReact(id, "LIKE");
        if(action === "dislike") swipeReact(id, "DISLIKE");
        if(action === "view"){
          localStorage.setItem("animalsitter_view_sitter", id);
          location.href = "profile.html#viewSitter";
        }
      };
    }

    if(liked){
      const likedSitters = getLikedSitters();
      if(!me){
        liked.innerHTML = `<div class="notice">Sign in to see liked sitters.</div>`;
      } else if(likedSitters.length === 0){
        liked.innerHTML = `<div class="notice">No liked sitters yet. Swipe right (Like) to add them here.</div>`;
      } else {
        liked.innerHTML = likedSitters.map(x=>{
          return `
            <div class="item">
              <div class="spread">
                <div>
                  <div><b>${escapeHtml(x.user.firstName)} ${escapeHtml(x.user.lastName)}</b></div>
                  <div class="muted">${escapeHtml(x.profile.bio || "")}</div>
                  <div class="pill">Rating: <span class="star-display">${escapeHtml(starDisplay(x.avg))}</span> <span class="muted">(${x.avg||0})</span></div>
                </div>
                <div class="row">
                  <button class="btn small" data-action="view" data-id="${x.user.id}">View</button>
                  <button class="btn small primary" data-action="msg" data-id="${x.user.id}">Message</button>
                  <button class="btn small good" data-action="book" data-id="${x.user.id}">Book</button>
                </div>
              </div>
            </div>
          `;
        }).join("");

        liked.onclick = (e)=>{
          const btn = e.target.closest("button");
          if(!btn) return;
          const action = btn.dataset.action;
          const id = btn.dataset.id;

          if(action==="view"){
            localStorage.setItem("animalsitter_view_sitter", id);
            location.href = "profile.html#viewSitter";
          }
          if(action==="msg"){
            localStorage.setItem("animalsitter_msg_to", id);
            location.href = "dashboard.html#messages";
          }
          if(action==="book"){
            localStorage.setItem("animalsitter_book_sitter", id);
            location.href = "dashboard.html#book";
          }
        };
      }
    }
  }

  function renderPets(){
    const me = getCurrentUser();
    const form = $("#petForm");
    const list = $("#petsList");

    if(!me){
      if(form) form.innerHTML = `<div class="notice">Sign in to add pets.</div>`;
      if(list) list.innerHTML = `<div class="notice">Sign in to view your pets.</div>`;
      return;
    }

    if(form){
      form.innerHTML = `
        <div class="item">
          <div class="spread">
            <div>
              <h3>Add a Pet</h3>
              <div class="muted">Add any animal with needs, age, and photo.</div>
            </div>
            <div class="pill">Owner: ${escapeHtml(me.firstName)}</div>
          </div>

          <div class="hr"></div>

          <div class="grid" style="grid-template-columns:1fr 1fr;">
            <div class="stack">
              <input class="input" id="petName" placeholder="Pet name *" />
              <select class="select" id="petType">
                <option value="DOG">Dog</option>
                <option value="CAT">Cat</option>
                <option value="BIRD">Bird</option>
                <option value="FISH">Fish</option>
                <option value="REPTILE">Reptile</option>
                <option value="OTHER">Other</option>
              </select>
              <input class="input" id="petAge" placeholder="Age (example: 2)" />
            </div>
            <div class="stack">
              <textarea class="textarea" id="petNeeds" placeholder="Needs (feeding schedule, meds, temperament, etc.)"></textarea>
              <input type="file" id="petPhoto" accept="image/*" />
              <button class="btn primary" id="addPetBtn">Add Pet</button>
            </div>
          </div>
        </div>
      `;

      $("#addPetBtn").onclick = async ()=>{
        const name = $("#petName").value;
        const type = $("#petType").value;
        const age = $("#petAge").value;
        const needs = $("#petNeeds").value;
        const file = $("#petPhoto").files?.[0];
        let photo = "";
        if(file) photo = await readFileAsDataURL(file);
        addPet({name, type, age, needs, photoDataUrl: photo});
      };
    }

    if(list){
      const s = getState();
      const pets = s.pets.filter(p => p.ownerUserId === me.id);

      if(pets.length === 0){
        list.innerHTML = `<div class="notice">No pets yet. Add your first pet above.</div>`;
      } else {
        list.innerHTML = pets.map(p=>{
          return `
            <div class="item">
              <div class="spread">
                <div class="row">
                  <img class="avatar" alt="pet" src="${p.photoDataUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOTAiIGhlaWdodD0iOTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjkwIiBoZWlnaHQ9IjkwIiByeD0iMTYiIGZpbGw9IiMyMDIwMmEiLz48cGF0aCBkPSJNMjUgNTBjMTAgLTE0IDMwIC0xNCA0MCAwYzAgMTYgLTIwIDI0IC0yMCAyNHMtMjAgLTggLTIwIC0yNHoiIGZpbGw9IiM0NDQ0NTUiLz48L3N2Zz4="}" />
                  <div>
                    <div><b>${escapeHtml(p.name)}</b> <span class="muted">· ${escapeHtml(p.type)}</span></div>
                    <div class="muted">Age: ${escapeHtml(p.age || "—")} · Added: ${escapeHtml(formatWhen(p.createdAt))}</div>
                    <div class="muted">${escapeHtml(p.needs || "")}</div>
                  </div>
                </div>
                <div class="row">
                  <button class="btn small" data-action="edit" data-id="${p.id}">Edit</button>
                  <button class="btn small bad" data-action="del" data-id="${p.id}">Delete</button>
                </div>
              </div>
            </div>
          `;
        }).join("");

        list.onclick = (e)=>{
          const btn = e.target.closest("button");
          if(!btn) return;
          const action = btn.dataset.action;
          const id = btn.dataset.id;

          if(action==="del") deletePet(id);
          if(action==="edit"){
            const s = getState();
            const pet = s.pets.find(x=>x.id===id);
            if(!pet) return;
            const newNeeds = prompt("Update needs:", pet.needs || "");
            if(newNeeds === null) return;
            updatePet(id, { needs: newNeeds });
          }
        };
      }
    }
  }

  function renderDashboard(){
    const me = getCurrentUser();
    const box = $("#dashboardBox");
    if(!box) return;

    if(!me){
      box.innerHTML = `<div class="notice">Sign in to view your dashboard.</div>`;
      return;
    }

    const s = getState();
    const myMessages = s.messages.filter(m => m.fromUserId===me.id || m.toUserId===me.id).slice(0, 12);

    const pending = s.sitterProfiles
      .filter(p => p.verificationStatus === SitterVerification.PENDING)
      .map(p => {
        const u = s.users.find(x=>x.id===p.userId);
        return u ? ({ user:u, profile:p }) : null;
      })
      .filter(Boolean);

    const activeSitters = getActiveSitters();

    const messageToId = localStorage.getItem("animalsitter_msg_to") || "";
    const bookSitterId = localStorage.getItem("animalsitter_book_sitter") || "";

    box.innerHTML = `
      <div class="item">
        <div class="spread">
          <div>
            <h2 style="margin:0;">Dashboard</h2>
            <div class="muted">Role-based dashboard (Client / Sitter / Admin/Employee).</div>
          </div>
          <div class="badge"><span class="dot"></span> Signed in as <b>${escapeHtml(me.role)}</b></div>
        </div>
      </div>

      <div class="grid" style="margin-top:14px;">
        <div class="card section">
          <h2>Messages</h2>
          <div class="muted">Send messages to sitters/clients. (Local only for now.)</div>
          <div class="hr"></div>
          <div class="stack">
            <input class="input" id="msgTo" placeholder="To user email (example: someone@email.com)" />
            <textarea class="textarea" id="msgBody" placeholder="Message..."></textarea>
            <button class="btn primary" id="sendMsgBtn">Send Message</button>
          </div>
          <div class="hr"></div>
          ${myMessages.length===0 ? `<div class="notice">No messages yet.</div>` : `
            <div class="list">
              ${myMessages.map(m=>{
                const from = s.users.find(u=>u.id===m.fromUserId);
                const to = s.users.find(u=>u.id===m.toUserId);
                return `
                  <div class="item">
                    <div class="muted">${escapeHtml(formatWhen(m.createdAt))}</div>
                    <div><b>From:</b> ${escapeHtml(from ? from.email : "Unknown")} <b>To:</b> ${escapeHtml(to ? to.email : "Unknown")}</div>
                    <div>${escapeHtml(m.body)}</div>
                  </div>
                `;
              }).join("")}
            </div>
          `}
        </div>

        <div class="card section">
          ${me.role===Roles.CLIENT ? `
            <h2>Client Tools</h2>
            <div class="muted">See active sitters, booking stub, and history placeholders.</div>
            <div class="hr"></div>
            <div class="stack">
              <div class="pill">Active sitters right now: <b>${activeSitters.length}</b></div>
              <div class="notice">Booking + payment history will be fully powered once we add backend + MySQL.</div>
              <button class="btn good" id="bookBtn">Book Appointment</button>
            </div>
          ` : ""}

          ${me.role===Roles.SITTER ? `
            <h2>Sitter Tools</h2>
            <div class="muted">Toggle active/inactive (shows on Home map/list when approved).</div>
            <div class="hr"></div>
            <div class="stack">
              <div class="pill">Status: <b>${getSitterProfile(me.id)?.isActive ? "ACTIVE" : "INACTIVE"}</b></div>
              <div class="row">
                <button class="btn good" id="goActiveBtn">Go Active</button>
                <button class="btn bad" id="goInactiveBtn">Go Inactive</button>
              </div>
              <div class="notice">Earnings, booking history, and schedule will come with backend + database.</div>
            </div>
          ` : ""}

          ${(me.role===Roles.ADMIN || me.role===Roles.EMPLOYEE) ? `
            <h2>Admin / Employee Tools</h2>
            <div class="muted">Approve/deny sitter applications. You can also view users.</div>
            <div class="hr"></div>
            ${pending.length===0 ? `<div class="notice">No sitter applications pending.</div>` : `
              <div class="list">
                ${pending.map(x=>{
                  return `
                    <div class="item">
                      <div><b>${escapeHtml(x.user.firstName)} ${escapeHtml(x.user.lastName)}</b> <span class="muted">· ${escapeHtml(x.user.email)}</span></div>
                      <div class="muted">Experience: ${Number(x.profile.experienceYears)||0} yrs</div>
                      <div class="muted">${escapeHtml(x.profile.bio || "")}</div>
                      <div class="row" style="margin-top:10px;">
                        <button class="btn good small" data-action="approve" data-id="${x.user.id}">Approve</button>
                        <button class="btn bad small" data-action="deny" data-id="${x.user.id}">Deny</button>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `}
          ` : ""}
        </div>
      </div>
    `;

    // Prefill message target if coming from other pages
    if(messageToId){
      const u = s.users.find(x=>x.id===messageToId);
      if(u) $("#msgTo").value = u.email;
      localStorage.removeItem("animalsitter_msg_to");
    }

    $("#sendMsgBtn").onclick = ()=>{
      const toEmail = ($("#msgTo").value || "").trim().toLowerCase();
      const body = $("#msgBody").value;

      if(!toEmail){ toast("Enter recipient email."); return; }

      // ensure recipient exists
      setState(st=>{
        let u = st.users.find(x=>x.email===toEmail);
        if(!u){
          u = { id: uid(), email: toEmail, firstName:"New", lastName:"User", phone:"", role: Roles.CLIENT, createdAt: nowIso() };
          st.users.push(u);
        }
      });

      const st2 = getState();
      const toUser = st2.users.find(x=>x.email===toEmail);
      if(!toUser){ toast("Recipient not found."); return; }
      sendMessage(toUser.id, body);
      $("#msgBody").value = "";
    };

    // Booking stub
    const bookBtn = $("#bookBtn");
    if(bookBtn){
      bookBtn.onclick = ()=>{
        const sitterId = bookSitterId || "";
        if(!sitterId){
          toast("Pick a sitter first (Swipe → Like → Book).");
          return;
        }
        toast("Booking stub created (backend will finalize).");
        localStorage.removeItem("animalsitter_book_sitter");
      };
    }

    const goActiveBtn = $("#goActiveBtn");
    const goInactiveBtn = $("#goInactiveBtn");
    if(goActiveBtn) goActiveBtn.onclick = ()=> setSitterActive(true);
    if(goInactiveBtn) goInactiveBtn.onclick = ()=> setSitterActive(false);

    // Approve/deny events
    box.onclick = (e)=>{
      const btn = e.target.closest("button[data-action]");
      if(!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if(action==="approve") approveOrDenySitter(id, true);
      if(action==="deny") approveOrDenySitter(id, false);
    };
  }

  function renderProfile(){
    const me = getCurrentUser();
    const profileBox = $("#profileBox");
    const viewBox = $("#viewSitterBox");

    if(profileBox){
      if(!me){
        profileBox.innerHTML = `<div class="notice">Sign in to view your profile.</div>`;
      } else {
        const p = getSitterProfile(me.id);
        const status = p ? p.verificationStatus : SitterVerification.NOT_SUBMITTED;

        profileBox.innerHTML = `
          <div class="item">
            <div class="row">
              <img class="avatar big" alt="me" src="${p?.photoDataUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI0IiBmaWxsPSIjMjAyMDJhIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI0OCIgcj0iMjAiIGZpbGw9IiM0NDQ0NTUiLz48cmVjdCB4PSIyOCIgeT0iNzAiIHdpZHRoPSI2NCIgaGVpZ2h0PSIyOCIgcng9IjE0IiBmaWxsPSIjMzIzMjQwIi8+PC9zdmc+"}" />
              <div>
                <div style="font-size:18px;"><b>${escapeHtml(me.firstName)} ${escapeHtml(me.lastName)}</b></div>
                <div class="muted">${escapeHtml(me.email)}</div>
                <div class="pill">Phone: ${escapeHtml(me.phone || "—")}</div>
                <div class="pill">Role (read-only): <b>${escapeHtml(me.role)}</b></div>
              </div>
            </div>
          </div>

          <div class="card section" style="margin-top:14px;">
            <h2>Become a Sitter</h2>
            <div class="muted">Apply with a profile photo + verification photo. Admin/Employee must approve you.</div>
            <div class="hr"></div>
            <div class="kv">
              <div class="k">Verification status</div>
              <div class="v"><b>${escapeHtml(status)}</b></div>
              <div class="k">Approved by</div>
              <div class="v">${p?.approvedBy ? escapeHtml(p.approvedBy) : "—"}</div>
              <div class="k">Approved at</div>
              <div class="v">${p?.approvedAt ? escapeHtml(formatWhen(p.approvedAt)) : "—"}</div>
            </div>

            <div class="hr"></div>

            <div class="grid" style="grid-template-columns:1fr 1fr;">
              <div class="stack">
                <textarea class="textarea" id="applyBio" placeholder="Bio">${escapeHtml(p?.bio || "")}</textarea>
                <input class="input" id="applyExp" type="number" min="0" placeholder="Years of experience" value="${escapeHtml(p?.experienceYears ?? 0)}" />
              </div>
              <div class="stack">
                <div class="muted">Profile photo</div>
                <input type="file" id="applyPhoto" accept="image/*" />
                <div class="muted">Verification photo</div>
                <input type="file" id="applyVerifyPhoto" accept="image/*" />
                <button class="btn primary" id="applyBtn">Submit Application</button>
              </div>
            </div>

            <div class="hr"></div>

            <div class="notice">
              Your role can’t be changed by you. After approval, Admin/Employee will upgrade you to <b>SITTER</b>.
              Then you can toggle Active status in Dashboard.
            </div>
          </div>
        `;

        $("#applyBtn").onclick = async ()=>{
          const bio = $("#applyBio").value;
          const exp = $("#applyExp").value;
          const photoFile = $("#applyPhoto").files?.[0];
          const verifyFile = $("#applyVerifyPhoto").files?.[0];

          let photoDataUrl = "";
          let verifyPhotoDataUrl = "";

          if(photoFile) photoDataUrl = await readFileAsDataURL(photoFile);
          if(verifyFile) verifyPhotoDataUrl = await readFileAsDataURL(verifyFile);

          applyToBeSitter({bio, experienceYears: exp, photoDataUrl, verifyPhotoDataUrl});
        };
      }
    }

    // View sitter profile (from home/swipe)
    if(viewBox){
      const sitterId = localStorage.getItem("animalsitter_view_sitter") || "";
      if(!sitterId){
        viewBox.innerHTML = `<div class="notice">No sitter selected. Go to Home/Swipe and click “View Profile”.</div>`;
      } else {
        const s = getState();
        const u = s.users.find(x=>x.id===sitterId);
        const p = s.sitterProfiles.find(x=>x.userId===sitterId);
        const avg = avgRating(sitterId);
        if(!u || !p){
          viewBox.innerHTML = `<div class="notice">Sitter not found.</div>`;
        } else {
          viewBox.innerHTML = `
            <div class="item">
              <div class="spread">
                <div class="row">
                  <img class="avatar big" alt="sitter" src="${p.photoDataUrl || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgcng9IjI0IiBmaWxsPSIjMjAyMDJhIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI0OCIgcj0iMjAiIGZpbGw9IiM0NDQ0NTUiLz48cmVjdCB4PSIyOCIgeT0iNzAiIHdpZHRoPSI2NCIgaGVpZ2h0PSIyOCIgcng9IjE0IiBmaWxsPSIjMzIzMjQwIi8+PC9zdmc+"}" />
                  <div>
                    <div style="font-size:18px;"><b>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</b></div>
                    <div class="muted">${escapeHtml(p.bio || "")}</div>
                    <div class="row" style="margin-top:8px;">
                      <span class="pill">Experience: ${Number(p.experienceYears)||0} yrs</span>
                      <span class="pill">Rating: <span class="star-display">${escapeHtml(starDisplay(avg))}</span> <span class="muted">(${avg||0})</span></span>
                      <span class="pill">Status: <b>${escapeHtml(p.verificationStatus)}</b></span>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <button class="btn" id="clearViewBtn">Clear</button>
                  <button class="btn primary" id="msgViewBtn">Message</button>
                </div>
              </div>
            </div>
          `;
          $("#clearViewBtn").onclick = ()=>{
            localStorage.removeItem("animalsitter_view_sitter");
            renderAll();
          };
          $("#msgViewBtn").onclick = ()=>{
            localStorage.setItem("animalsitter_msg_to", sitterId);
            location.href = "dashboard.html#messages";
          };
        }
      }
    }
  }

  // ---------------------------
  // Render all
  // ---------------------------
  function renderAll(){
    renderHeader();

    const page = document.body.dataset.page;
    if(page === "home") renderHome();
    if(page === "swipe") renderSwipe();
    if(page === "pets") renderPets();
    if(page === "dashboard") renderDashboard();
    if(page === "profile") renderProfile();
  }

  // ---------------------------
  // Init
  // ---------------------------
  function init(){
    // ensure state exists
    load();

    wireHeader();
    renderAll();
  }

  window.AnimalSitterApp = {
    signIn, signOut, setMyRole,
    // exposed for debugging in console if needed:
    getState, setState,
  };

  document.addEventListener("DOMContentLoaded", init);
})();