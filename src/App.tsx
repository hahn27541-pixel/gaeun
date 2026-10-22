import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  NotebookPen,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { supabase, isConfigured, emailDeliveryEnabled } from "./lib/supabase";

type Note = {
  id: string;
  title: string;
  body: string;
  version: number;
  is_pinned: boolean;
  archived_at: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};
type Draft = { title: string; body: string; is_pinned: boolean };
type Access = { is_admin: boolean; status: string; email_verified: boolean };
type Member = {
  id: string;
  display_name: string;
  email: string;
  status: string;
  email_verified: boolean;
  is_admin: boolean;
  created_at: string;
};
type Revision = {
  note_id: string;
  version: number;
  title: string;
  body: string;
  created_at: string;
  edited_by: string;
};
type Notice = { text: string; kind: "error" | "success" | "info" };
const blankDraft: Draft = { title: "", body: "", is_pinned: false };
const demo = new URLSearchParams(window.location.search).get("demo") === "1";
const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;
const toDraft = (note: Note): Draft => ({
  title: note.title,
  body: note.body,
  is_pinned: note.is_pinned,
});
const hasChanges = (note: Note | null, draft: Draft) =>
  !!note &&
  (note.title !== draft.title ||
    note.body !== draft.body ||
    note.is_pinned !== draft.is_pinned);
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
const fullDate = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const statusLabel: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인 완료",
  rejected: "승인 거절",
  suspended: "이용 정지",
};

function errorText(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
  if (message.includes("Invalid login credentials"))
    return "이메일 또는 비밀번호를 확인해 주세요.";
  if (message.includes("Email not confirmed"))
    return emailDeliveryEnabled
      ? "이메일 인증을 먼저 완료해 주세요. 받은 편지함을 확인해 주세요."
      : "계정 확인이 필요해요. 관리자에게 문의해 주세요.";
  if (message.includes("already registered"))
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (message.includes("rate limit") || message.includes("security purposes"))
    return "요청이 잠시 제한되었어요. 잠시 후 다시 시도해 주세요.";
  if (message.includes("Failed to fetch") || message.includes("NetworkError"))
    return "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.";
  return message;
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-symbol">
        <svg width="23" height="23" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M8 7v18h17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 8h9M16 13h9M16 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".75" />
        </svg>
      </span>
      <span className="brand-name">
        로반 메모보드<span>LAWBAHN MEMOBOARD</span>
      </span>
    </div>
  );
}
function Loading({ text = "잠시만 기다려 주세요" }: { text?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={22} />
      <span>{text}</span>
    </div>
  );
}
function NoticeBar({
  notice,
  onClose,
}: {
  notice: Notice | null;
  onClose: () => void;
}) {
  return notice ? (
    <div
      className={"notice notice-" + notice.kind}
      role={notice.kind === "error" ? "alert" : "status"}
    >
      <span>{notice.text}</span>
      <button className="icon-button" aria-label="알림 닫기" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  ) : null;
}

function AuthScreen({
  recovery,
  onRecoveryDone,
}: {
  recovery: boolean;
  onRecoveryDone: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sentEmail, setSentEmail] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setNotice(null);
    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onRecoveryDone();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: name.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setSentEmail(emailDeliveryEnabled ? email.trim() : "");
        setNotice({
          kind: "success",
          text: emailDeliveryEnabled
            ? "확인 메일을 보냈어요. 이메일 인증 후 로그인해 주세요. 기존 계정이라면 바로 로그인할 수 있어요."
            : data.session
              ? "가입 신청이 완료되었어요. 관리자의 승인 후 메모를 이용할 수 있습니다."
              : "가입 신청 결과를 확인해 주세요. 로그인할 수 없다면 관리자에게 문의해 주세요.",
        });
      } else if (mode === "reset") {
        if (!emailDeliveryEnabled) {
          setMode("login");
          return;
        }
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: window.location.origin + "/?auth=recovery" },
        );
        if (error) throw error;
        setNotice({
          kind: "success",
          text: "가입된 이메일이라면 비밀번호 재설정 링크가 발송됩니다. 받은 편지함을 확인해 주세요.",
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!supabase || busy || !emailDeliveryEnabled) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: sentEmail,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      setNotice({
        kind: "success",
        text: "확인 메일을 다시 보냈어요. 스팸함도 확인해 주세요.",
      });
    } catch (error) {
      setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  const title = recovery
    ? "새로운 비밀번호를 정해 주세요"
    : mode === "signup"
      ? "함께 기록할 준비가 되었나요?"
      : mode === "reset"
        ? "비밀번호를 잊으셨나요?"
        : "다시 만나서 반가워요";
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div className="story-copy">
          <div className="eyebrow">LAWBAHN TEAM WORKSPACE</div>
          <h1>
            함께 기록하고,
            <br />
            바로 이어가세요<span>.</span>
          </h1>
          <p>
            회의 내용과 업무 메모를 한곳에.
            <br />
            승인된 멤버와 필요한 기록을 공유하세요.
          </p>
          <div className="story-note">
            <span className="story-note-label">
              <FileText size={16} /> LAWBAHN WORKSPACE
            </span>
            <h3>
              오늘의 업무를 기록하고,<br />다음 업무를 함께 준비하세요.
            </h3>
            <div className="story-note-rule" />
            <div className="story-note-bottom">
              <span className="mini-avatars">
                <i>로</i>
                <i>반</i>
                <i>팀</i>
              </span>
              <span>작성 · 공유 · 이력 관리</span>
              <CheckCircle2 size={17} />
            </div>
          </div>
        </div>
        <div className="story-bottom">
          <ShieldCheck size={17} />
          <span>승인된 멤버와 나누는 안전한 공간</span>
        </div>
      </section>
      <section className="auth-main">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-card">
          <span className="section-kicker">LAWBAHN MEMOBOARD</span>
          <h2>{title}</h2>
          <p className="auth-description">
            {recovery
              ? "8자 이상의 비밀번호로 계정을 안전하게 보호하세요."
              : mode === "signup"
                ? emailDeliveryEnabled
                  ? "이메일 인증과 관리자 승인 후 함께할 수 있어요."
                  : "회원가입 후 관리자 승인을 받아 함께할 수 있어요."
                : mode === "reset"
                  ? "가입한 이메일로 재설정 링크를 보내드릴게요."
                  : "로그인하고 우리 팀의 기록을 이어가세요."}
          </p>
          {!recovery && mode !== "reset" && (
            <div className="auth-tabs">
              <button
                className={mode === "login" ? "active" : ""}
                onClick={() => {
                  setMode("login");
                  setNotice(null);
                }}
              >
                로그인
              </button>
              <button
                className={mode === "signup" ? "active" : ""}
                onClick={() => {
                  setMode("signup");
                  setNotice(null);
                }}
              >
                회원가입
              </button>
            </div>
          )}
          <NoticeBar notice={notice} onClose={() => setNotice(null)} />
          <form className="auth-form" onSubmit={submit}>
            {!recovery && mode === "signup" && (
              <label>
                이름
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="멤버에게 보여줄 이름"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </label>
            )}
            {!recovery && (
              <label>
                이메일
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {(recovery || mode !== "reset") && (
              <label>
                {recovery ? "새 비밀번호" : "비밀번호"}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "login" && !recovery
                      ? "비밀번호를 입력하세요"
                      : "8자 이상 입력하세요"
                  }
                  autoComplete={
                    mode === "login" && !recovery
                      ? "current-password"
                      : "new-password"
                  }
                  required
                  minLength={mode === "login" && !recovery ? 1 : 8}
                  maxLength={128}
                />
              </label>
            )}
            {emailDeliveryEnabled && mode === "login" && !recovery && (
              <button
                type="button"
                className="text-button forgot-password"
                onClick={() => {
                  setMode("reset");
                  setNotice(null);
                }}
              >
                비밀번호를 잊으셨나요?
              </button>
            )}
            <button
              className="button button-primary auth-submit"
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                <>
                  {recovery
                    ? "비밀번호 변경"
                    : mode === "signup"
                      ? "가입 신청하기"
                      : mode === "reset"
                        ? "재설정 링크 받기"
                        : "로그인"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {emailDeliveryEnabled && sentEmail && mode === "signup" && (
            <button
              className="text-button resend-button"
              disabled={busy}
              onClick={() => void resend()}
            >
              확인 메일 다시 보내기
            </button>
          )}
          {mode === "reset" && !recovery && (
            <button
              className="text-button back-login"
              onClick={() => {
                setMode("login");
                setNotice(null);
              }}
            >
              <ArrowLeft size={15} /> 로그인으로 돌아가기
            </button>
          )}
          <p className="auth-footnote">
            <LockKeyhole size={14} /> 모든 메모는 승인된 멤버에게만 공개됩니다.
          </p>
        </div>
        <div className="auth-copyright">
          © {new Date().getFullYear()} LAWBAHN{" "}
          <span>로반의 기록을 잇는 공유 메모</span>
        </div>
      </section>
    </main>
  );
}

const demoNotes: Note[] = [
  {
    id: "demo-welcome",
    title: "함께 쓰는 첫 번째 메모",
    body: "로반 메모보드에 오신 것을 환영합니다.\n\n회의 내용과 업무 메모를 팀과 공유하는 공간입니다.\n함께 확인할 사항, 진행 중인 업무, 다음 회의에서 논의할 내용을 남겨 보세요.\n\n이렇게 시작해 보세요\n\n01.  왼쪽의 + 버튼으로 새로운 메모를 만들어요.\n02.  내용을 작성한 뒤 ‘저장’을 눌러 공유해요.\n03.  중요한 메모는 상단에 고정해 두세요.\n\n함께 편집할 때도 안심하세요.\n다른 멤버의 변경 사항을 확인하고, 이전 기록도 다시 살펴볼 수 있어요.\n\n필요한 기록을 한곳에, 로반 메모보드.",
    version: 3,
    is_pinned: true,
    archived_at: null,
    created_by: "demo",
    updated_by: "demo",
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-22T01:24:00Z",
  },
  {
    id: "demo-ideas",
    title: "다음 주를 위한 아이디어",
    body: "작은 아이디어도 가볍게 모아 두는 곳.\n\n• 월요일 오전에 짧게 한 주의 방향 나누기\n• 좋은 자료를 발견하면 이곳에 공유하기\n• 매주 하나씩, 더 나은 일하는 방식 찾아보기",
    version: 1,
    is_pinned: false,
    archived_at: null,
    created_by: "demo",
    updated_by: "demo",
    created_at: "2026-10-21T00:00:00Z",
    updated_at: "2026-10-21T08:30:00Z",
  },
  {
    id: "demo-meeting",
    title: "팀 미팅 기록",
    body: "우리가 함께 정한 것들을 기록합니다.\n\n이번 주 돌아보기\n다음 주의 우선순위\n함께 논의할 이야기",
    version: 1,
    is_pinned: false,
    archived_at: null,
    created_by: "demo",
    updated_by: "demo",
    created_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T05:00:00Z",
  },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(!demo && isConfigured);
  const [recovery, setRecovery] = useState(false);
  const [access, setAccess] = useState<Access | null>(
    demo ? { is_admin: false, status: "approved", email_verified: true } : null,
  );
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [displayName, setDisplayName] = useState(demo ? "체험 멤버" : "");
  const [notes, setNotes] = useState<Note[]>(demo ? demoNotes : []);
  const [selected, setSelected] = useState<Note | null>(
    demo ? demoNotes[0]! : null,
  );
  const [draft, setDraft] = useState<Draft>(
    demo ? toDraft(demoNotes[0]!) : blankDraft,
  );
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [section, setSection] = useState<"notes" | "archive" | "members">(
    "notes",
  );
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberFilter, setMemberFilter] = useState<"pending" | "all">(
    "pending",
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [mobileEditor, setMobileEditor] = useState(false);
  const [live, setLive] = useState(false);
  const accountRef = useRef<string | null>(null);
  const selectedRef = useRef(selected);
  const draftRef = useRef(draft);
  const notesRef = useRef(notes);
  const fetchRef = useRef(0);
  const savingRef = useRef(false);
  const historyRef = useRef(0);
  const allowed =
    demo ||
    (!!access &&
      access.email_verified &&
      (access.is_admin || access.status === "approved"));
  const dirty = hasChanges(selected, draft);
  notesRef.current = notes;
  const applyNote = useCallback((note: Note | null) => {
    selectedRef.current = note;
    const next = note ? toDraft(note) : blankDraft;
    draftRef.current = next;
    setSelected(note);
    setDraft(next);
    setConflict(false);
  }, []);
  const clearPrivateState = useCallback(() => {
    fetchRef.current += 1;
    historyRef.current += 1;
    setAccess(null);
    setNotes([]);
    notesRef.current = [];
    applyNote(null);
    setMembers([]);
    setRevisions([]);
    setRevision(null);
    setHistoryOpen(false);
    setProfileOpen(false);
    setDisplayName("");
    setNotice(null);
    setSearch("");
    setSection("notes");
  }, [applyNote]);

  useEffect(() => {
    if (demo || !supabase) return;
    let mounted = true;
    let authEventSeen = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      authEventSeen = true;
      const id = session?.user.id ?? null;
      if (accountRef.current !== id) clearPrivateState();
      accountRef.current = id;
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted || authEventSeen) return;
      if (error) setAccessError(errorText(error));
      accountRef.current = data.session?.user.id ?? null;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [clearPrivateState]);
  const refreshAccess = useCallback(async () => {
    if (!supabase || !user || demo) return;
    const identity = user.id;
    setAccessLoading(true);
    setAccessError("");
    try {
      const [{ data, error }, profile] = await Promise.all([
        supabase.rpc("current_access"),
        supabase
          .from("profiles")
          .select("display_name")
          .eq("id", identity)
          .maybeSingle(),
      ]);
      if (accountRef.current !== identity) return;
      if (error) throw error;
      const next = one(data as Access | Access[] | null);
      if (!next)
        throw new Error("회원 정보를 불러오지 못했어요. 다시 확인해 주세요.");
      setAccess(next);
      setDisplayName(
        profile.data?.display_name ||
          String(user.user_metadata.display_name || "멤버"),
      );
      if (
        !next.email_verified ||
        (!next.is_admin && next.status !== "approved")
      ) {
        fetchRef.current += 1;
        historyRef.current += 1;
        setNotes([]);
        notesRef.current = [];
        applyNote(null);
        setMembers([]);
        setRevisions([]);
        setRevision(null);
        setHistoryOpen(false);
      }
    } catch (error) {
      if (accountRef.current === identity) setAccessError(errorText(error));
    } finally {
      if (accountRef.current === identity) setAccessLoading(false);
    }
  }, [user, applyNote]);
  useEffect(() => {
    void refreshAccess();
  }, [refreshAccess]);
  const loadNotes = useCallback(
    async (background = false) => {
      if (!supabase || !user || demo) return;
      const identity = user.id;
      const request = ++fetchRef.current;
      if (!background) setNotesLoading(true);
      try {
        const found: Note[] = [];
        for (let offset = 0; ; offset += 200) {
          const { data, error } = await supabase
            .from("notes")
            .select("*")
            .order("updated_at", { ascending: false })
            .order("id")
            .range(offset, offset + 199);
          if (error) throw error;
          found.push(...(data as Note[]));
          if (data.length < 200) break;
        }
        if (accountRef.current !== identity || request !== fetchRef.current)
          return;
        setNotes(found);
        notesRef.current = found;
        setNotesError("");
        const current = selectedRef.current;
        if (current) {
          const latest = found.find((note) => note.id === current.id) ?? null;
          if (!latest || latest.version !== current.version) {
            if (hasChanges(current, draftRef.current) || savingRef.current)
              setConflict(true);
            else applyNote(latest);
          }
        }
      } catch (error) {
        if (accountRef.current === identity && request === fetchRef.current)
          setNotesError(errorText(error));
      } finally {
        if (accountRef.current === identity && request === fetchRef.current)
          setNotesLoading(false);
      }
    },
    [user, applyNote],
  );
  const loadMembers = useCallback(async () => {
    if (!supabase || !user || !access?.is_admin || demo) return;
    const identity = user.id;
    setMembersLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_members");
      if (accountRef.current !== identity) return;
      if (error) throw error;
      setMembers((data as Member[]) ?? []);
    } catch (error) {
      if (accountRef.current === identity)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      if (accountRef.current === identity) setMembersLoading(false);
    }
  }, [user, access?.is_admin]);
  useEffect(() => {
    if (allowed) void loadNotes();
  }, [allowed, loadNotes]);
  useEffect(() => {
    if (allowed && access?.is_admin) void loadMembers();
  }, [allowed, access?.is_admin, loadMembers]);
  useEffect(() => {
    if (!supabase || !user || demo) return;
    const channel = supabase
      .channel("moa-access-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          ...(access?.is_admin ? {} : { filter: "id=eq." + user.id }),
        },
        () => {
          void refreshAccess();
          if (access?.is_admin) void loadMembers();
        },
      )
      .subscribe();
    const refresh = () => {
      if (document.visibilityState === "visible") void refreshAccess();
    };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      void supabase?.removeChannel(channel);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [user, access?.is_admin, refreshAccess, loadMembers]);
  useEffect(() => {
    if (!supabase || !user || !allowed || demo) return;
    const channel = supabase
      .channel("moa-notes-" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes" },
        () => {
          void loadNotes(true);
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void loadNotes(true);
      });
    const refresh = () => {
      if (document.visibilityState === "visible") void loadNotes(true);
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      void supabase?.removeChannel(channel);
      setLive(false);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [user, allowed, loadNotes]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(patch: Partial<Draft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
  }
  function mayLeave() {
    return (
      !hasChanges(selectedRef.current, draftRef.current) ||
      window.confirm(
        "저장하지 않은 변경 사항이 있어요. 변경 사항을 버리고 이동할까요?",
      )
    );
  }
  function selectNote(note: Note) {
    if (selectedRef.current?.id === note.id) {
      setMobileEditor(true);
      return;
    }
    if (!mayLeave()) return;
    applyNote(note);
    setMobileEditor(true);
  }
  function navigate(next: typeof section) {
    if (next === section) {
      setMobileEditor(false);
      return;
    }
    if (!mayLeave()) return;
    applyNote(null);
    setSection(next);
    setSearch("");
    setMobileEditor(false);
  }
  async function createNote() {
    if (busy || !mayLeave()) return;
    setBusy(true);
    const identity = accountRef.current;
    const startingNoteId = selectedRef.current?.id;
    const startingDraft = { ...draftRef.current };
    try {
      let created: Note;
      if (demo) {
        const now = new Date().toISOString();
        created = {
          id: crypto.randomUUID(),
          title: "제목 없는 메모",
          body: "",
          version: 1,
          is_pinned: false,
          archived_at: null,
          created_by: "demo",
          updated_by: "demo",
          created_at: now,
          updated_at: now,
        };
      } else {
        if (!supabase) return;
        const { data, error } = await supabase.rpc("create_note", {
          p_title: "제목 없는 메모",
          p_body: "",
        });
        if (error) throw error;
        const row = one(data as Note | Note[] | null);
        if (!row)
          throw new Error("메모를 만들지 못했어요. 다시 시도해 주세요.");
        created = row;
      }
      if (!demo && accountRef.current !== identity) return;
      fetchRef.current += 1;
      setNotesLoading(false);
      setNotes((previous) => [
        created,
        ...previous.filter((note) => note.id !== created.id),
      ]);
      const currentDraft = draftRef.current;
      const editorUnchanged =
        selectedRef.current?.id === startingNoteId &&
        currentDraft.title === startingDraft.title &&
        currentDraft.body === startingDraft.body &&
        currentDraft.is_pinned === startingDraft.is_pinned;
      if (editorUnchanged) {
        applyNote(created);
        setSection("notes");
        setSearch("");
        setMobileEditor(true);
      } else
        setNotice({
          kind: "info",
          text: "새 메모를 목록에 만들었어요. 현재 작성 중인 내용은 유지했습니다.",
        });
      if (!demo) void loadNotes(true);
    } catch (error) {
      if (demo || accountRef.current === identity)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  async function saveNote(archived?: boolean) {
    const original = selectedRef.current;
    if (!original || savingRef.current || busy || conflict) return;
    const snapshot = { ...draftRef.current };
    if (!snapshot.title.trim()) {
      setNotice({ kind: "error", text: "메모 제목을 입력해 주세요." });
      return;
    }
    const identity = accountRef.current;
    savingRef.current = true;
    setBusy(true);
    try {
      let saved: Note;
      if (demo)
        saved = {
          ...original,
          ...snapshot,
          title: snapshot.title.trim(),
          version: original.version + 1,
          updated_at: new Date().toISOString(),
          archived_at:
            archived === undefined
              ? original.archived_at
              : archived
                ? new Date().toISOString()
                : null,
        };
      else {
        if (!supabase) return;
        const { data, error } = await supabase.rpc("save_note", {
          p_note_id: original.id,
          p_expected_version: original.version,
          p_title: snapshot.title.trim(),
          p_body: snapshot.body,
          p_is_pinned: snapshot.is_pinned,
          p_archived: archived ?? !!original.archived_at,
        });
        if (error) {
          if (error.code === "PT409") {
            if (
              accountRef.current === identity &&
              selectedRef.current?.id === original.id
            ) {
              setConflict(true);
              void loadNotes(true);
            }
            return;
          }
          throw error;
        }
        const row = one(data as Note | Note[] | null);
        if (!row)
          throw new Error(
            "저장 결과를 확인하지 못했어요. 최신 내용을 확인해 주세요.",
          );
        saved = row;
      }
      if (!demo && accountRef.current !== identity) return;
      fetchRef.current += 1;
      setNotesLoading(false);
      setNotes((previous) => [
        saved,
        ...previous.filter((note) => note.id !== saved.id),
      ]);
      if (selectedRef.current?.id === original.id) {
        const newest = draftRef.current;
        const typedDuringSave =
          newest.title !== snapshot.title ||
          newest.body !== snapshot.body ||
          newest.is_pinned !== snapshot.is_pinned;
        if (typedDuringSave) {
          selectedRef.current = saved;
          setSelected(saved);
          setConflict(false);
        } else applyNote(saved);
      }
      setNotice({
        kind: "success",
        text:
          archived === undefined
            ? "변경 사항을 저장했어요."
            : archived
              ? "메모를 보관함으로 옮겼어요."
              : "메모를 공유 메모로 되돌렸어요.",
      });
      if (!demo) void loadNotes(true);
    } catch (error) {
      if (demo || accountRef.current === identity)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }
  const saveRef = useRef(saveNote);
  saveRef.current = saveNote;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        selectedRef.current
      ) {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  async function signOut() {
    if (!mayLeave()) return;
    if (demo) {
      window.location.href = window.location.pathname;
      return;
    }
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setNotice({ kind: "error", text: errorText(error) });
      return;
    }
    accountRef.current = null;
    setUser(null);
    clearPrivateState();
  }
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice({ kind: "success", text: "클립보드에 복사했어요." });
    } catch {
      setNotice({
        kind: "error",
        text: "복사 권한을 사용할 수 없어요. 내용을 선택해 직접 복사해 주세요.",
      });
    }
  }
  function reloadConflict() {
    if (
      !window.confirm(
        "현재 작성 중인 내용을 버리고 서버의 최신 내용을 불러올까요? 필요한 내용은 먼저 복사해 주세요.",
      )
    )
      return;
    const current = selectedRef.current;
    applyNote(notesRef.current.find((note) => note.id === current?.id) ?? null);
    if (!demo) void loadNotes(true);
  }
  async function openHistory() {
    if (!selectedRef.current) return;
    const note = selectedRef.current;
    const request = ++historyRef.current;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setRevision(null);
    setRevisions([]);
    if (demo) {
      setRevisions([{ ...note, note_id: note.id, edited_by: "demo" }]);
      setHistoryLoading(false);
      return;
    }
    if (!supabase) return;
    const identity = accountRef.current;
    try {
      const { data, error } = await supabase
        .from("note_revisions")
        .select("note_id,version,title,body,edited_by,created_at")
        .eq("note_id", note.id)
        .order("version", { ascending: false })
        .limit(100);
      if (identity !== accountRef.current || request !== historyRef.current)
        return;
      if (error) throw error;
      setRevisions((data as Revision[]) ?? []);
    } catch (error) {
      if (identity === accountRef.current && request === historyRef.current)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      if (identity === accountRef.current && request === historyRef.current)
        setHistoryLoading(false);
    }
  }
  async function updateMember(member: Member, status: string) {
    if (!supabase || busy) return;
    if (
      (status === "rejected" || status === "suspended") &&
      !window.confirm(
        member.display_name +
          " 님을 " +
          statusLabel[status] +
          " 상태로 변경할까요?",
      )
    )
      return;
    const identity = accountRef.current;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_member_status", {
        p_user_id: member.id,
        p_status: status,
      });
      if (error) throw error;
      if (identity === accountRef.current) {
        setNotice({
          kind: "success",
          text: member.display_name + " 님의 상태를 변경했어요.",
        });
        await loadMembers();
      }
    } catch (error) {
      if (identity === accountRef.current)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  async function updateProfile(event: FormEvent) {
    event.preventDefault();
    if (!profileName.trim()) return;
    if (demo) {
      setDisplayName(profileName.trim());
      setProfileOpen(false);
      return;
    }
    if (!supabase || busy) return;
    const identity = accountRef.current;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("update_my_display_name", {
        p_display_name: profileName.trim(),
      });
      if (error) throw error;
      if (identity === accountRef.current) {
        setDisplayName(profileName.trim());
        setProfileOpen(false);
      }
    } catch (error) {
      if (identity === accountRef.current)
        setNotice({ kind: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!notice || notice.kind === "error") return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (!historyOpen && !profileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialogs = document.querySelectorAll<HTMLElement>(
      '[aria-modal="true"]',
    );
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previousFocus?.focus();
    };
  }, [historyOpen, profileOpen]);

  if (!demo && !isConfigured)
    return (
      <main className="gate-page">
        <Brand />
        <div className="gate-card">
          <span className="gate-icon">
            <Settings2 size={29} />
          </span>
          <span className="section-kicker">ALMOST READY</span>
          <h1>우리의 공간을 준비하고 있어요</h1>
          <p>
            서비스 연결 설정이 아직 완료되지 않았습니다.
            <br />
            관리자에게 서비스 준비 상태를 확인해 주세요.
          </p>
          <div className="gate-info">
            <ShieldCheck size={18} />
            <span>메모와 계정은 데이터베이스 연결 후 사용할 수 있습니다.</span>
          </div>
        </div>
        <span className="gate-caption">
          로반 메모보드 · 필요한 기록을 한곳에
        </span>
      </main>
    );
  if (authLoading)
    return (
      <div className="full-loading">
        <Brand />
        <Loading text="로반 메모보드에 연결하고 있어요" />
      </div>
    );
  if ((!user && !demo) || recovery)
    return (
      <AuthScreen
        recovery={recovery}
        onRecoveryDone={() => {
          setRecovery(false);
          setNotice({ kind: "success", text: "비밀번호를 변경했어요." });
        }}
      />
    );
  if (!allowed) {
    const verified = access?.email_verified ?? !!user?.email_confirmed_at;
    const state = access?.status;
    return (
      <main className="gate-page">
        <Brand />
        <div className="gate-card">
          {accessLoading && !access ? (
            <Loading text="이용 권한을 확인하고 있어요" />
          ) : (
            <>
              <span className="gate-icon">
                {!verified && emailDeliveryEnabled ? (
                  <Mail size={30} />
                ) : state === "pending" ? (
                  <Clock3 size={30} />
                ) : (
                  <ShieldCheck size={30} />
                )}
              </span>
              <span className="section-kicker">YOUR SHARED SPACE</span>
              <h1>
                {accessError
                  ? "잠시 연결을 확인해 주세요"
                  : !verified
                    ? emailDeliveryEnabled
                      ? "이메일을 확인해 주세요"
                      : "계정 확인이 필요해요"
                    : state === "rejected"
                      ? "가입 승인이 거절되었어요"
                      : state === "suspended"
                        ? "현재 이용이 정지되어 있어요"
                        : "관리자의 승인을 기다리고 있어요"}
              </h1>
              <p>
                {accessError ||
                  (!verified
                    ? emailDeliveryEnabled
                      ? "가입한 이메일로 발송된 인증 링크를 열어 주세요."
                      : "아직 계정 확인이 완료되지 않았어요. 관리자에게 문의해 주세요."
                    : state === "rejected" || state === "suspended"
                      ? "이용 상태에 관한 사항은 최고관리자에게 문의해 주세요."
                      : "가입 신청이 완료되었어요. 관리자가 승인하면 우리 팀의 메모를 함께 작성할 수 있습니다.")}
              </p>
              <div className="gate-info">
                <ShieldCheck size={18} />
                <div>
                  <strong>최고관리자</strong>
                  <span>kge@lawbahn.com</span>
                </div>
              </div>
              <NoticeBar notice={notice} onClose={() => setNotice(null)} />
              <button
                className="button button-primary"
                disabled={accessLoading}
                onClick={() => void refreshAccess()}
              >
                <RefreshCw size={16} className={accessLoading ? "spin" : ""} />{" "}
                승인 상태 다시 확인
              </button>
              <button className="text-button" onClick={() => void signOut()}>
                <LogOut size={15} /> 로그아웃
              </button>
            </>
          )}
        </div>
        <span className="gate-caption">{user?.email}</span>
      </main>
    );
  }
  const archived = section === "archive";
  const filteredNotes = notes
    .filter(
      (note) =>
        !!note.archived_at === archived &&
        (!search ||
          (note.title + "\n" + note.body)
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase())),
    )
    .sort(
      (a, b) =>
        Number(b.is_pinned) - Number(a.is_pinned) ||
        b.updated_at.localeCompare(a.updated_at),
    );
  const pendingMembers = members.filter(
    (member) => member.status === "pending" && !member.is_admin,
  );
  const visibleMembers = memberFilter === "pending" ? pendingMembers : members;
  const activeCount = notes.filter((note) => !note.archived_at).length;
  const archivedCount = notes.filter((note) => note.archived_at).length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-card">
          <span className="workspace-avatar">
            <Users size={20} />
          </span>
          <div>
            <strong>로반 워크스페이스</strong>
            <span>공유 워크스페이스</span>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="sidebar-label">WORKSPACE</span>
        <nav className="workspace-nav" aria-label="워크스페이스 메뉴">
          <button
            aria-label="공유 메모"
            className={section === "notes" ? "active" : ""}
            onClick={() => navigate("notes")}
          >
            <NotebookPen size={18} />
            <span>공유 메모</span>
            <span className="nav-count">{activeCount}</span>
          </button>
          <button
            aria-label="보관함"
            className={archived ? "active" : ""}
            onClick={() => navigate("archive")}
          >
            <Archive size={18} />
            <span>보관함</span>
            {archivedCount > 0 && (
              <span className="nav-count">{archivedCount}</span>
            )}
          </button>
          {access?.is_admin && (
            <button
              aria-label="멤버 관리"
              className={section === "members" ? "active" : ""}
              onClick={() => navigate("members")}
            >
              <Users size={18} />
              <span>멤버 관리</span>
              {pendingMembers.length > 0 && (
                <span className="nav-count pending-count">
                  {pendingMembers.length}
                </span>
              )}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-message">
            <span className="message-drawing">
              <FileText size={24} strokeWidth={1.3} />
              <span>+</span>
            </span>
            <strong>함께 쓰면, 더 좋은 기록</strong>
            <p>
              작은 생각도 편하게 남겨요.
              <br />
              우리의 다음이 시작되는 곳.
            </p>
            <span className="security-note">
              <ShieldCheck size={13} /> 승인된 멤버만 함께해요
            </span>
          </div>
          <div className="account-row">
            <span className="avatar">{displayName.slice(0, 1) || "M"}</span>
            <button
              className="account-info"
              onClick={() => {
                setProfileName(displayName);
                setProfileOpen(true);
              }}
              title="프로필 설정"
            >
              <strong>
                {displayName || "멤버"}
                {access?.is_admin && <span className="admin-mini">관리자</span>}
              </strong>
              <span>{demo ? "미리보기 · 저장되지 않아요" : user?.email}</span>
            </button>
            <button
              className="icon-button logout-button"
              title="로그아웃"
              aria-label="로그아웃"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main
        className={
          "workspace-main " + (mobileEditor ? "mobile-show-editor" : "")
        }
      >
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="demo-dot" /> 체험 화면
            </span>
            <span>변경 사항은 이 화면에서만 유지돼요.</span>
            <a href={window.location.pathname}>
              서비스로 돌아가기 <ArrowRight size={13} />
            </a>
          </div>
        )}
        <div className="global-notice">
          <NoticeBar notice={notice} onClose={() => setNotice(null)} />
        </div>
        {section === "members" ? (
          <section className="members-page">
            <div className="members-heading">
              <div>
                <span className="section-kicker">PEOPLE & PERMISSIONS</span>
                <h1>함께하는 멤버</h1>
                <p>우리의 공간에 함께할 멤버를 관리하세요.</p>
              </div>
              <button
                className="button button-secondary"
                onClick={() => void loadMembers()}
                disabled={membersLoading}
              >
                <RefreshCw size={16} className={membersLoading ? "spin" : ""} />{" "}
                새로고침
              </button>
            </div>
            <div className="admin-callout">
              <ShieldCheck size={22} />
              <div>
                <strong>관리자 승인 후 메모를 이용할 수 있어요</strong>
                <p>
                  {emailDeliveryEnabled
                    ? "이메일 인증을 마친 멤버를 승인해 주세요. 이용 정지 시 메모 접근이 제한됩니다."
                    : "이메일 소유 여부는 자동 확인되지 않아요. 가입자를 별도로 확인한 후 승인해 주세요. 이용 정지 시 메모 접근이 제한됩니다."}
                </p>
              </div>
            </div>
            <div className="member-tabs">
              <button
                className={memberFilter === "pending" ? "active" : ""}
                onClick={() => setMemberFilter("pending")}
              >
                승인 대기 <span>{pendingMembers.length}</span>
              </button>
              <button
                className={memberFilter === "all" ? "active" : ""}
                onClick={() => setMemberFilter("all")}
              >
                전체 멤버 <span>{members.length}</span>
              </button>
            </div>
            {membersLoading && !members.length ? (
              <Loading text="멤버를 불러오고 있어요" />
            ) : !visibleMembers.length ? (
              <div className="empty-state">
                <CheckCircle2 size={35} strokeWidth={1.3} />
                <h3>
                  {memberFilter === "pending"
                    ? "모든 가입 신청을 확인했어요"
                    : "등록된 멤버가 없어요"}
                </h3>
                <p>새로운 신청이 도착하면 이곳에서 확인할 수 있어요.</p>
              </div>
            ) : (
              <div className="member-list">
                {visibleMembers.map((member) => (
                  <article className="member-row" key={member.id}>
                    <span className="avatar">
                      {member.display_name.slice(0, 1)}
                    </span>
                    <div className="member-identity">
                      <h3>
                        {member.display_name}{" "}
                        {member.is_admin && (
                          <span className="admin-mini">최고관리자</span>
                        )}
                      </h3>
                      <span>{member.email}</span>
                      <small>
                        {dateLabel(member.created_at)} 가입 ·{" "}
                        {emailDeliveryEnabled
                          ? member.email_verified
                            ? "이메일 인증 완료"
                            : "이메일 미인증"
                          : member.email_verified
                            ? "이메일 소유 확인 별도"
                            : "계정 확인 필요 · 이메일 소유 확인 별도"}
                      </small>
                    </div>
                    <span className={"status-badge status-" + member.status}>
                      {statusLabel[member.status] ?? member.status}
                    </span>
                    <div className="member-actions">
                      {!member.is_admin && (
                        <>
                          {member.status !== "approved" && (
                            <button
                              className="button button-primary button-small"
                              disabled={busy || !member.email_verified}
                              title={
                                !member.email_verified
                                  ? emailDeliveryEnabled
                                    ? "이메일 인증 후 승인할 수 있어요"
                                    : "계정 확인 후 승인할 수 있어요"
                                  : "멤버 승인"
                              }
                              onClick={() =>
                                void updateMember(member, "approved")
                              }
                            >
                              <Check size={14} /> 승인
                            </button>
                          )}
                          {member.status === "pending" && (
                            <button
                              className="button button-secondary button-small"
                              disabled={busy}
                              onClick={() =>
                                void updateMember(member, "rejected")
                              }
                            >
                              거절
                            </button>
                          )}
                          {member.status === "approved" && (
                            <button
                              className="button button-secondary button-small"
                              disabled={busy}
                              onClick={() =>
                                void updateMember(member, "suspended")
                              }
                            >
                              이용 정지
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="notes-layout">
            <section className="notes-panel" aria-label="메모 목록">
              <div className="notes-panel-heading">
                <div>
                  <span className="section-kicker">
                    {archived ? "YOUR ARCHIVE" : "OUR SHARED NOTES"}
                  </span>
                  <h1>
                    {archived ? "보관함" : "공유 메모"}{" "}
                    <span>{archived ? archivedCount : activeCount}</span>
                  </h1>
                </div>
                <button
                  className="new-note-button"
                  aria-label="새 메모 만들기"
                  title="새 메모 만들기"
                  onClick={() => void createNote()}
                  disabled={busy}
                >
                  <Plus size={21} />
                </button>
              </div>
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="메모 검색"
                  placeholder="메모 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="검색어 지우기"
                    onClick={() => setSearch("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="list-label">
                <span>
                  {search
                    ? "검색 결과"
                    : archived
                      ? "보관된 메모"
                      : "모든 메모"}
                </span>
                <span>최근 수정순</span>
              </div>
              {notesError && (
                <div className="list-error" role="alert">
                  <p>{notesError}</p>
                  <button
                    className="text-button"
                    onClick={() => void loadNotes()}
                  >
                    다시 불러오기
                  </button>
                </div>
              )}
              <div className="note-list">
                {notesLoading && !notes.length ? (
                  <Loading text="메모를 불러오고 있어요" />
                ) : !filteredNotes.length ? (
                  <div className="list-empty">
                    <Search size={28} strokeWidth={1.3} />
                    <h3>
                      {search
                        ? "일치하는 메모가 없어요"
                        : archived
                          ? "보관함이 비어 있어요"
                          : "첫 기록을 남겨 보세요"}
                    </h3>
                    <p>
                      {search
                        ? "다른 검색어로 찾아보세요."
                        : archived
                          ? "보관한 메모는 이곳에 모여요."
                          : "새 메모를 만들어 생각을 나눠 보세요."}
                    </p>
                    {!search && !archived && (
                      <button
                        className="text-button"
                        onClick={() => void createNote()}
                      >
                        <Plus size={15} /> 새 메모 만들기
                      </button>
                    )}
                  </div>
                ) : (
                  filteredNotes.map((note) => (
                    <button
                      className={
                        "note-card " +
                        (selected?.id === note.id ? "selected" : "")
                      }
                      key={note.id}
                      onClick={() => selectNote(note)}
                      aria-current={
                        selected?.id === note.id ? "true" : undefined
                      }
                    >
                      <div className="note-card-title">
                        <h2>{note.title}</h2>
                        {note.is_pinned && (
                          <Pin size={13} className="pin-icon" />
                        )}
                      </div>
                      <p>{note.body.trim() || "아직 작성한 내용이 없어요."}</p>
                      <div className="note-card-meta">
                        <span>{dateLabel(note.updated_at)}</span>
                        <span>
                          <Users size={12} /> 공유 메모
                        </span>
                        {selected?.id === note.id && dirty && (
                          <i
                            className="unsaved-dot"
                            title="저장하지 않은 변경 사항"
                          />
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="sync-status">
                <span
                  className={"sync-dot " + (live || demo ? "connected" : "")}
                />
                <span>
                  {demo
                    ? "함께 쓰는 공간을 미리 둘러보세요"
                    : live
                      ? "변경 사항이 실시간으로 반영돼요"
                      : "실시간 연결을 확인하고 있어요"}
                </span>
                <button
                  className="icon-button"
                  aria-label="메모 새로고침"
                  title="메모 새로고침"
                  onClick={() => void loadNotes(true)}
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </section>
            <section className="editor-pane" aria-label="메모 편집기">
              {selected ? (
                <>
                  <div className="editor-toolbar">
                    <div className="editor-location">
                      <button
                        className="icon-button mobile-back"
                        aria-label="메모 목록으로"
                        onClick={() => setMobileEditor(false)}
                      >
                        <ArrowLeft size={19} />
                      </button>
                      <FileText size={16} />
                      <span>
                        {selected.archived_at ? "보관함" : "공유 메모"}
                      </span>
                      <ChevronRight size={13} />
                      <span className="breadcrumb-title">{selected.title}</span>
                    </div>
                    <div className="editor-tools">
                      <button
                        className={
                          "icon-button " + (draft.is_pinned ? "is-pinned" : "")
                        }
                        aria-label={draft.is_pinned ? "고정 해제" : "메모 고정"}
                        title={draft.is_pinned ? "고정 해제" : "메모 고정"}
                        onClick={() => edit({ is_pinned: !draft.is_pinned })}
                      >
                        <Pin size={17} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="변경 이력"
                        title="변경 이력"
                        onClick={() => void openHistory()}
                      >
                        <History size={18} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={
                          selected.archived_at
                            ? "공유 메모로 복원"
                            : "메모 보관"
                        }
                        title={
                          selected.archived_at
                            ? "공유 메모로 복원"
                            : "메모 보관"
                        }
                        disabled={busy || conflict}
                        onClick={() => {
                          if (
                            window.confirm(
                              selected.archived_at
                                ? "이 메모를 공유 메모로 되돌릴까요?"
                                : "이 메모를 보관함으로 옮길까요? 작성 중인 내용도 함께 저장됩니다.",
                            )
                          )
                            void saveNote(!selected.archived_at);
                        }}
                      >
                        <Archive size={17} />
                      </button>
                      <span className="tool-divider" />
                      <button
                        className="button button-primary save-button"
                        disabled={busy || conflict || !dirty}
                        onClick={() => void saveNote()}
                      >
                        {busy ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Save size={15} />
                        )}
                        <span>저장</span>
                      </button>
                    </div>
                  </div>
                  {conflict && (
                    <div className="conflict-banner" role="alert">
                      <strong>다른 멤버가 이 메모를 변경했어요.</strong>
                      <p>
                        작성 중인 내용은 유지했어요. 필요한 내용을 복사한 뒤
                        최신 메모를 확인해 주세요.
                      </p>
                      <div>
                        <button
                          className="button button-secondary button-small"
                          onClick={() =>
                            void copyText(draft.title + "\n\n" + draft.body)
                          }
                        >
                          <Copy size={13} /> 작성 내용 복사
                        </button>
                        <button
                          className="button button-secondary button-small"
                          onClick={reloadConflict}
                        >
                          <RefreshCw size={13} /> 최신 내용 불러오기
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="editor-document">
                    <div className="document-topline">
                      <span className="document-type">
                        <FileText size={13} />{" "}
                        {selected.archived_at
                          ? "보관된 메모"
                          : "우리의 공유 메모"}
                      </span>
                      <span
                        className={"save-status " + (dirty ? "is-dirty" : "")}
                      >
                        <span />
                        {dirty
                          ? "저장하지 않은 변경 사항"
                          : "모든 변경 사항 저장됨"}
                      </span>
                    </div>
                    <input
                      className="note-title"
                      aria-label="메모 제목"
                      value={draft.title}
                      onChange={(e) => edit({ title: e.target.value })}
                      maxLength={160}
                      placeholder="제목을 입력하세요"
                    />
                    <div className="document-meta">
                      <span>
                        <Clock3 size={13} /> {fullDate(selected.updated_at)}{" "}
                        수정
                      </span>
                      <span className="meta-dot">·</span>
                      <span>버전 {selected.version}</span>
                    </div>
                    <div className="document-rule" />
                    <textarea
                      className="note-body"
                      aria-label="메모 내용"
                      value={draft.body}
                      onChange={(e) => edit({ body: e.target.value })}
                      maxLength={100000}
                      placeholder={
                        "생각을 자유롭게 적어 보세요.\n이 메모는 승인된 모든 멤버와 공유됩니다."
                      }
                      spellCheck={false}
                    />
                  </div>
                  <footer className="editor-footer">
                    <span>
                      <Users size={14} /> 승인된 멤버와 공유 중
                    </span>
                    <span>
                      {draft.body.length.toLocaleString("ko-KR")}자 <i />{" "}
                      <span className="shortcut-hint">Ctrl / ⌘ + S로 저장</span>
                    </span>
                  </footer>
                </>
              ) : (
                <div className="editor-empty">
                  <div className="empty-illustration">
                    <NotebookPen size={45} strokeWidth={1.15} />
                    <span>
                      <Plus size={17} />
                    </span>
                  </div>
                  <span className="section-kicker">
                    A LITTLE THOUGHT, A NEW BEGINNING
                  </span>
                  <h2>작은 기록에서 시작해요</h2>
                  <p>
                    메모를 선택하거나 새로운 이야기를 남겨 보세요.
                    <br />
                    함께 쌓아가는 생각이 우리의 다음이 됩니다.
                  </p>
                  <button
                    className="button button-primary"
                    onClick={() => void createNote()}
                    disabled={busy}
                  >
                    <Plus size={17} /> 새 메모 만들기
                  </button>
                  <span className="empty-note">
                    <ShieldCheck size={14} /> 승인된 멤버만 볼 수 있는
                    공간이에요
                  </span>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      {historyOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setHistoryOpen(false);
          }}
        >
          <section
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
          >
            <header>
              <div>
                <span className="section-kicker">NOTE HISTORY</span>
                <h2 id="history-title">변경 이력</h2>
              </div>
              <button
                className="icon-button"
                aria-label="변경 이력 닫기"
                autoFocus
                onClick={() => setHistoryOpen(false)}
              >
                <X size={21} />
              </button>
            </header>
            <p className="history-description">
              이 메모의 최근 저장 기록을 확인하세요. 최대 100개의 기록이
              표시됩니다.
            </p>
            {historyLoading ? (
              <Loading text="저장 기록을 불러오고 있어요" />
            ) : revision ? (
              <div className="revision-detail">
                <button
                  className="text-button"
                  onClick={() => setRevision(null)}
                >
                  <ArrowLeft size={15} /> 기록 목록
                </button>
                <div className="revision-heading">
                  <span>버전 {revision.version}</span>
                  <button
                    className="button button-secondary button-small"
                    onClick={() =>
                      void copyText(revision.title + "\n\n" + revision.body)
                    }
                  >
                    <Copy size={13} /> 복사
                  </button>
                </div>
                <h3>{revision.title}</h3>
                <p className="revision-date">{fullDate(revision.created_at)}</p>
                <pre>{revision.body || "작성된 내용이 없습니다."}</pre>
              </div>
            ) : revisions.length ? (
              <div className="revision-list">
                {revisions.map((item) => (
                  <button
                    className="revision-row"
                    key={item.version}
                    onClick={() => setRevision(item)}
                  >
                    <span className="revision-icon">
                      <History size={17} />
                    </span>
                    <span>
                      <strong>버전 {item.version}</strong>
                      <small>{fullDate(item.created_at)}</small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <History size={29} />
                <h3>저장된 기록이 없어요</h3>
                <p>메모를 저장하면 기록이 남습니다.</p>
              </div>
            )}
          </section>
        </div>
      )}
      {profileOpen && (
        <div
          className="modal-backdrop centered"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProfileOpen(false);
          }}
        >
          <section
            className="profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
          >
            <header>
              <h2 id="profile-title">내 프로필</h2>
              <button
                className="icon-button"
                aria-label="프로필 닫기"
                onClick={() => setProfileOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            <form className="auth-form" onSubmit={updateProfile}>
              <label>
                이름
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
              </label>
              <label>
                이메일
                <input
                  value={demo ? "체험 화면" : (user?.email ?? "")}
                  disabled
                />
              </label>
              <button
                className="button button-primary"
                disabled={busy || !profileName.trim()}
              >
                {busy ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  "변경 사항 저장"
                )}
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
