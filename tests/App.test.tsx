import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

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
type RpcResult = {
  data: Note | null;
  error: { code: string; message: string } | null;
};

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  notesRange: vi.fn(),
  createNote: vi.fn(),
  saveNote: vi.fn(),
  onAuthStateChange: vi.fn(),
  getSession: vi.fn(),
  unsubscribe: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
  state: {
    access: { is_admin: false, status: "approved", email_verified: true },
    notes: [] as Note[],
  },
}));

vi.mock("../src/lib/supabase", () => ({
  isConfigured: true,
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
    auth: {
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
    },
  },
}));

const initialNote: Note = {
  id: "note-initial",
  title: "팀 회의 메모",
  body: "공유된 원본 내용",
  version: 1,
  is_pinned: false,
  archived_at: null,
  created_by: "member-1",
  updated_by: "member-1",
  created_at: "2026-10-21T00:00:00Z",
  updated_at: "2026-10-21T01:00:00Z",
};
const signedInUser = {
  id: "member-1",
  email: "member@example.com",
  email_confirmed_at: "2026-10-20T00:00:00Z",
  // User-editable metadata must never override the server's approval decision.
  user_metadata: {
    display_name: "테스트 멤버",
    status: "approved",
    is_admin: true,
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function openInitialNote(user: ReturnType<typeof userEvent.setup>) {
  const card = await screen.findByRole("button", {
    name: /팀 회의 메모 공유된 원본 내용/,
  });
  await user.click(card);
  return screen.getByRole("textbox", {
    name: "메모 내용",
  }) as HTMLTextAreaElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.access = {
    is_admin: false,
    status: "approved",
    email_verified: true,
  };
  mocks.state.notes = [{ ...initialNote }];
  window.history.replaceState({}, "", "/");
  vi.spyOn(window, "confirm").mockReturnValue(true);

  const session = { user: signedInUser };
  mocks.onAuthStateChange.mockImplementation((callback) => {
    callback("INITIAL_SESSION", session);
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  mocks.getSession.mockResolvedValue({ data: { session }, error: null });
  mocks.channel.mockImplementation(() => {
    const channel = { on: vi.fn(), subscribe: vi.fn() };
    channel.on.mockReturnValue(channel);
    // Deliberately do not emit a live subscription event or trigger extra fetches.
    channel.subscribe.mockReturnValue(channel);
    return channel;
  });
  mocks.removeChannel.mockResolvedValue("ok");
  mocks.notesRange.mockImplementation(async () => ({
    data: mocks.state.notes.map((note) => ({ ...note })),
    error: null,
  }));
  mocks.from.mockImplementation((table: string) => {
    if (table === "profiles") {
      const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
      chain.select.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.maybeSingle.mockResolvedValue({
        data: { display_name: "테스트 멤버" },
        error: null,
      });
      return chain;
    }
    if (table === "notes") {
      const chain = {
        select: vi.fn(),
        order: vi.fn(),
        range: mocks.notesRange,
      };
      chain.select.mockReturnValue(chain);
      chain.order.mockReturnValue(chain);
      return chain;
    }
    throw new Error(`Unexpected table query: ${table}`);
  });
  mocks.rpc.mockImplementation((name: string, args: unknown) => {
    if (name === "current_access")
      return Promise.resolve({ data: { ...mocks.state.access }, error: null });
    if (name === "create_note") return mocks.createNote(args);
    if (name === "save_note") return mocks.saveNote(args);
    throw new Error(`Unexpected RPC: ${name}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("approval and collaborative editing", () => {
  it("keeps a pending member behind the approval screen without requesting private notes", async () => {
    mocks.state.access.status = "pending";
    const user = userEvent.setup();
    render(<App />);

    await screen.findByRole("heading", {
      name: "관리자의 승인을 기다리고 있어요",
    });
    expect(screen.queryByRole("region", { name: "메모 목록" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "메모 내용" })).toBeNull();
    expect(screen.queryByRole("button", { name: "새 메모 만들기" })).toBeNull();
    expect(screen.queryByText(initialNote.body)).toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith("notes");
    expect(mocks.notesRange).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "승인 상태 다시 확인" }),
    );
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(
        mocks.rpc.mock.calls.filter(([name]) => name === "current_access"),
      ).toHaveLength(2),
    );
    expect(
      screen.getByRole("heading", { name: "관리자의 승인을 기다리고 있어요" }),
    ).toBeTruthy();
    expect(mocks.notesRange).not.toHaveBeenCalled();
    expect(mocks.createNote).not.toHaveBeenCalled();
    expect(mocks.saveNote).not.toHaveBeenCalled();
  });

  it("keeps edits in the selected note when a delayed create request finishes", async () => {
    const pendingCreate = deferred<RpcResult>();
    mocks.createNote.mockReturnValue(pendingCreate.promise);
    const user = userEvent.setup();
    render(<App />);
    const editor = await openInitialNote(user);

    await user.click(screen.getByRole("button", { name: "새 메모 만들기" }));
    expect(mocks.createNote).toHaveBeenCalledWith({
      p_title: "제목 없는 메모",
      p_body: "",
    });
    await user.type(editor, " · 새 메모 생성 중에도 이어 쓴 문장");
    const draftWhileCreating = editor.value;
    const created: Note = {
      ...initialNote,
      id: "note-created",
      title: "제목 없는 메모",
      body: "",
      created_at: "2026-10-22T00:00:00Z",
      updated_at: "2026-10-22T00:00:00Z",
    };

    await act(async () => {
      mocks.state.notes = [created, { ...initialNote }];
      pendingCreate.resolve({ data: created, error: null });
    });

    const list = screen.getByRole("region", { name: "메모 목록" });
    await within(list).findByRole("button", {
      name: /제목 없는 메모 아직 작성한 내용이 없어요/,
    });
    expect(
      (screen.getByRole("textbox", { name: "메모 제목" }) as HTMLInputElement)
        .value,
    ).toBe(initialNote.title);
    expect(
      (
        screen.getByRole("textbox", {
          name: "메모 내용",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(draftWhileCreating);
    expect(screen.getByText("저장하지 않은 변경 사항")).toBeTruthy();
    expect(
      screen.getByText(
        "새 메모를 목록에 만들었어요. 현재 작성 중인 내용은 유지했습니다.",
      ),
    ).toBeTruthy();
    expect(
      within(list)
        .getByRole("button", { name: /팀 회의 메모 공유된 원본 내용/ })
        .getAttribute("aria-current"),
    ).toBe("true");
  });

  it("preserves typing during a delayed save and uses the saved version for the next save", async () => {
    const pendingSave = deferred<RpcResult>();
    mocks.saveNote.mockReturnValueOnce(pendingSave.promise);
    const user = userEvent.setup();
    render(<App />);
    const editor = await openInitialNote(user);

    await user.type(editor, " · 먼저 저장할 문장");
    const firstSnapshot = editor.value;
    await user.click(screen.getByRole("button", { name: "저장", exact: true }));
    expect(mocks.saveNote).toHaveBeenNthCalledWith(1, {
      p_note_id: initialNote.id,
      p_expected_version: 1,
      p_title: initialNote.title,
      p_body: firstSnapshot,
      p_is_pinned: false,
      p_archived: false,
    });
    await user.type(editor, " · 저장 응답 전 추가한 문장");
    const nextDraft = editor.value;
    const saved: Note = {
      ...initialNote,
      body: firstSnapshot,
      version: 2,
      updated_at: "2026-10-22T01:00:00Z",
    };

    await act(async () => {
      mocks.state.notes = [saved];
      pendingSave.resolve({ data: saved, error: null });
    });

    await screen.findByText("버전 2");
    expect(
      (
        screen.getByRole("textbox", {
          name: "메모 내용",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(nextDraft);
    expect(screen.getByText("저장하지 않은 변경 사항")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "저장",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    mocks.saveNote.mockImplementationOnce(async () => {
      const nextSaved = { ...saved, body: nextDraft, version: 3 };
      mocks.state.notes = [nextSaved];
      return { data: nextSaved, error: null };
    });
    await user.click(screen.getByRole("button", { name: "저장", exact: true }));
    await screen.findByText("버전 3");
    expect(mocks.saveNote).toHaveBeenNthCalledWith(2, {
      p_note_id: initialNote.id,
      p_expected_version: 2,
      p_title: initialNote.title,
      p_body: nextDraft,
      p_is_pinned: false,
      p_archived: false,
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "메모 내용",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(nextDraft);
    expect(screen.getByText("모든 변경 사항 저장됨")).toBeTruthy();
  });

  it("shows a version conflict without overwriting the local draft or retrying the save", async () => {
    mocks.saveNote.mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "다른 멤버가 먼저 저장했습니다." },
    });
    const user = userEvent.setup();
    render(<App />);
    const editor = await openInitialNote(user);
    await user.type(editor, " · 반드시 남겨야 하는 내 초안");
    const localDraft = editor.value;
    mocks.state.notes = [
      { ...initialNote, body: "다른 멤버가 저장한 서버 최신 내용", version: 2 },
    ];

    await user.click(screen.getByRole("button", { name: "저장", exact: true }));

    const conflict = await screen.findByRole("alert");
    expect(conflict.textContent).toContain("다른 멤버가 이 메모를 변경했어요.");
    expect(conflict.textContent).toContain("작성 중인 내용은 유지했어요.");
    expect(
      (
        screen.getByRole("textbox", {
          name: "메모 내용",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(localDraft);
    expect(screen.getByText("버전 1")).toBeTruthy();
    expect(
      within(conflict).getByRole("button", { name: "작성 내용 복사" }),
    ).toBeTruthy();
    expect(
      within(conflict).getByRole("button", { name: "최신 내용 불러오기" }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "저장",
          exact: true,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.keyboard("{Control>}s{/Control}");
    expect(mocks.saveNote).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole("textbox", {
          name: "메모 내용",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(localDraft);
  });
});
