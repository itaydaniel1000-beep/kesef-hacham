/* ===== מולטיפלייר: חדר עם קוד, חיבור ישיר בין הדפדפנים (WebRTC דרך PeerJS) =====
   מי שיוצר את החדר הוא ה"מארח": כולם מתחברים אליו, והוא מעביר לכל אחד את המיקומים של כל השאר */

const PEER_SCRIPT = "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js";
const PREFIX = "mirotz3d-room-";
const PUBLIC_PREFIX = "mirotz3d-public-"; // חדרים רנדומליים: מספרים קבועים שכל אחד יכול למצוא
const PUBLIC_ROOMS = 30;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // בלי O/0 ו-I/1 שמתבלבלים

let scriptLoading = null;
function loadPeer() {
  if (window.Peer) return Promise.resolve(window.Peer);
  scriptLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PEER_SCRIPT;
    s.onload = () => resolve(window.Peer);
    s.onerror = () => reject(new Error("לא הצלחנו לטעון את רכיב החיבור"));
    document.head.appendChild(s);
  });
  return scriptLoading;
}

/* לבדיקות אפשר להפנות לשרת חיבור מקומי: ?peerhost=localhost&peerport=9000 */
function peerOptions() {
  const p = new URLSearchParams(location.search);
  const opts = { debug: 0, config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:global.stun.twilio.com:3478" }] } };
  if (p.get("peerhost")) Object.assign(opts, { host: p.get("peerhost"), port: Number(p.get("peerport") || 9000), path: "/", secure: false });
  return opts;
}

const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export class Room {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = "";
    this.myId = "";
    this.conns = new Map();   // אצל המארח: מזהה שחקן -> חיבור
    this.hostConn = null;     // אצל אורח: החיבור למארח
    this.handlers = {};
    this.closed = false;
  }

  on(type, fn) {
    this.handlers[type] = fn;
    return this;
  }

  emit(type, ...args) {
    this.handlers[type]?.(...args);
  }

  /* יצירת חדר חדש — מנסים קודים עד שמוצאים אחד פנוי */
  async create() {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      try {
        this.peer = await openPeer(Peer, PREFIX + code);
        this.code = code;
        break;
      } catch (e) {
        if (e.type !== "unavailable-id") throw e;
      }
    }
    if (!this.peer) throw new Error("לא הצלחנו ליצור חדר, נסו שוב");
    this.becomeHost();
    return this.code;
  }

  becomeHost() {
    this.isHost = true;
    this.myId = "host";
    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        this.conns.set(conn.peer, conn);
      });
      conn.on("data", (msg) => this.emit("message", msg, conn.peer));
      conn.on("close", () => {
        this.conns.delete(conn.peer);
        this.emit("left", conn.peer);
      });
      conn.on("error", () => {});
    });
    this.watchPeer();
  }

  /* חדר רנדומלי: עוברים על החדרים הציבוריים לפי הסדר. חדר פתוח עם מקום — מצטרפים;
     מספר שאין בו חדר — פותחים בו חדר חדש ומחכים לאחרים */
  async quickMatch(hello) {
    const Peer = await loadPeer();
    this.isPublic = true;
    for (let i = 0; i < PUBLIC_ROOMS; i++) {
      this.peer ||= await openPeer(Peer, undefined);
      const result = await this.tryJoin(PUBLIC_PREFIX + i, hello);
      if (result === "joined") {
        this.code = String(i);
        return "guest";
      }
      if (result === "full") continue;
      /* אין חדר במספר הזה — לוקחים אותו. אם מישהו הקדים אותנו, מנסים להצטרף אליו */
      this.peer.destroy();
      this.peer = null;
      try {
        this.peer = await openPeer(Peer, PUBLIC_PREFIX + i);
      } catch (e) {
        if (e.type === "unavailable-id") {
          i--;
          continue;
        }
        throw e;
      }
      this.code = String(i);
      this.becomeHost();
      return "host";
    }
    throw new Error("כל החדרים הרנדומליים מלאים, נסו שוב עוד מעט");
  }

  /* ניסיון להתחבר לחדר: "joined" / "full" / "none" (אין חדר כזה) */
  tryJoin(id, hello) {
    return new Promise((resolve) => {
      const conn = this.peer.connect(id, { reliable: true });
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.peer.off("error", onError);
        if (result !== "joined") conn.close();
        resolve(result);
      };
      const timer = setTimeout(() => finish("full"), 8000); // לא עונה — מדלגים עליו
      const onError = (e) => {
        if (e.type === "peer-unavailable") finish("none");
      };
      this.peer.on("error", onError);
      conn.on("open", () => conn.send(hello));
      conn.on("data", (msg) => {
        if (!done) {
          if (msg.t === "full") return finish("full");
          this.hostConn = conn;
          this.myId = this.peer.id;
          finish("joined");
        }
        this.emit("message", msg, "host");
      });
      conn.on("close", () => {
        if (!done) finish("full");
        else if (this.hostConn === conn && !this.closed) this.emit("hostLeft");
      });
    });
  }

  /* הצטרפות לחדר קיים לפי קוד */
  async join(code) {
    const Peer = await loadPeer();
    this.peer = await openPeer(Peer, undefined);
    this.code = code.toUpperCase();
    this.myId = this.peer.id;
    await new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
      const timer = setTimeout(() => reject(new Error("החדר לא נמצא. בדקו את הקוד")), 9000);
      const fail = (e) => {
        clearTimeout(timer);
        reject(new Error(e?.type === "peer-unavailable" ? "החדר לא נמצא. בדקו את הקוד" : "החיבור נכשל"));
      };
      this.peer.once("error", fail);
      conn.on("open", () => {
        clearTimeout(timer);
        this.peer.off("error", fail);
        this.hostConn = conn;
        resolve();
      });
      conn.on("data", (msg) => this.emit("message", msg, "host"));
      conn.on("close", () => {
        if (!this.closed) this.emit("hostLeft");
      });
    });
    this.watchPeer();
  }

  watchPeer() {
    this.peer.on("disconnected", () => {
      if (!this.closed) this.peer.reconnect();
    });
  }

  /* אורח -> מארח */
  send(msg) {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  /* מארח -> כולם (או לכולם חוץ מאחד) */
  broadcast(msg, except) {
    for (const [id, conn] of this.conns) if (id !== except && conn.open) conn.send(msg);
  }

  sendTo(id, msg) {
    const conn = this.conns.get(id);
    if (conn?.open) conn.send(msg);
  }

  leave() {
    this.closed = true;
    try {
      this.peer?.destroy();
    } catch {
      /* כבר סגור */
    }
  }
}

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const timer = setTimeout(() => reject(Object.assign(new Error("אין חיבור לשרת. בדקו את האינטרנט"), { type: "timeout" })), 10000);
    peer.once("open", () => {
      clearTimeout(timer);
      resolve(peer);
    });
    peer.once("error", (e) => {
      clearTimeout(timer);
      peer.destroy();
      reject(Object.assign(new Error(e.type === "unavailable-id" ? "הקוד תפוס" : "אין חיבור לשרת. בדקו את האינטרנט"), { type: e.type }));
    });
  });
}
