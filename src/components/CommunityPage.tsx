import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { ShieldCheck, UsersRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import { supabaseConfigured } from "../lib/supabaseConfig";

type Friend = { id: string; name: string };

export function CommunityPage({ profileName }: { profileName: string }) {
  const [friends, setFriends] = useState<Friend[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fitquest-local-friends") || "[]") as Array<{ id: string; name: string }>;
      return saved.map(({ id, name }) => ({ id, name }));
    } catch { return []; }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [incomingCode, setIncomingCode] = useState("");
  const [incomingLocal, setIncomingLocal] = useState<{ id: string; name: string } | null>(null);

  const localInviteId = useMemo(() => {
    const key = "fitquest-invite-id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() ?? `fq-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(key, id);
    }
    return id;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite_code");
    const id = params.get("invite");
    const name = params.get("from") || "A FITQUEST friend";
    if (code) setIncomingCode(code);
    if (id && id !== localInviteId) setIncomingLocal({ id, name });
  }, [localInviteId]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setFriends([]);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const loadFriends = useCallback(async (activeSession: Session) => {
    if (!supabase) return;
    const { data: rows, error: friendshipError } = await supabase
      .from("friendships")
      .select("friend_id")
      .eq("user_id", activeSession.user.id);
    if (friendshipError) throw friendshipError;
    const ids = (rows ?? []).map((row) => row.friend_id as string);
    if (!ids.length) {
      setFriends([]);
      return;
    }
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (profileError) throw profileError;
    setFriends((profiles ?? []).map((profile) => ({ id: profile.id, name: profile.display_name })));
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let alive = true;
    void (async () => {
      try {
        const { error: saveError } = await supabase
          .from("profiles")
          .upsert({ id: session.user.id, display_name: profileName || "FITQUEST member" }, { onConflict: "id" });
        if (saveError) throw saveError;
        await loadFriends(session);
      } catch (error) {
        if (alive) setNotice(error instanceof Error ? error.message : "Could not load your FITQUEST circle.");
      }
    })();
    return () => { alive = false; };
  }, [loadFriends, profileName, refresh, session]);

  const cleanInviteUrl = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url;
  };

  const shareUrl = async (url: URL) => {
    const message = `Join me on FITQUEST Campus and let's move together! ${url.toString()}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on FITQUEST", text: message, url: url.toString() });
        setNotice("Invite shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url.toString());
        setNotice("Invite link copied. Send it to a friend to join your FITQUEST circle.");
      } else {
        window.location.href = `mailto:?subject=${encodeURIComponent("Join me on FITQUEST Campus")}&body=${encodeURIComponent(message)}`;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setNotice("Could not share automatically. Copy the invite address from your browser to send it.");
    }
  };

  const invite = async () => {
    setNotice("");
    const url = cleanInviteUrl();
    url.searchParams.set("from", profileName || "A FITQUEST friend");
    if (supabaseConfigured) {
      if (!session || !supabase) {
        setNotice("Create an account or sign in before sending a synced friend invite.");
        return;
      }
      setBusy(true);
      const { data: code, error } = await supabase.rpc("create_friend_invite");
      setBusy(false);
      if (error || !code) {
        setNotice(error?.message || "Could not create an invite. Check that the FITQUEST Supabase schema is installed.");
        return;
      }
      url.searchParams.set("invite_code", String(code));
    } else {
      url.searchParams.set("invite", localInviteId);
    }
    await shareUrl(url);
  };

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setNotice("");
    const result = signUp
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: profileName || "FITQUEST member" } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) setNotice(result.error.message);
    else if (signUp && !result.data.session) setNotice("Account created. Check your email to confirm it, then sign in.");
    else setNotice(signUp ? "Account created. Your FITQUEST circle can now sync." : "You are signed in.");
  };

  const acceptInvite = async () => {
    if (incomingCode) {
      if (!session || !supabase) {
        setNotice("Create an account or sign in to accept this synced invitation.");
        return;
      }
      setBusy(true);
      const { data: name, error } = await supabase.rpc("accept_friend_invite", { invite_code: incomingCode });
      setBusy(false);
      if (error) {
        setNotice(error.message);
        return;
      }
      setIncomingCode("");
      setNotice(`${name || "Your friend"} is now in your FITQUEST circle.`);
      window.history.replaceState({}, "", window.location.pathname);
      setRefresh((value) => value + 1);
      return;
    }
    if (!incomingLocal) return;
    const localFriends = JSON.parse(localStorage.getItem("fitquest-local-friends") || "[]") as Array<{ id: string }>;
    if (!localFriends.some((friend) => friend.id === incomingLocal.id)) {
      localStorage.setItem("fitquest-local-friends", JSON.stringify([...localFriends, { ...incomingLocal, joinedAt: new Date().toISOString() }]));
      setFriends((current) => [...current, { id: incomingLocal.id, name: incomingLocal.name }]);
    }
    setIncomingLocal(null);
    window.history.replaceState({}, "", window.location.pathname);
    setNotice(`${incomingLocal.name} was added on this device. Configure Supabase to sync friends between accounts.`);
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
    else setNotice("You are signed out.");
  };

  return (
    <div className="community-page">
      <section className="community-hero">
        <div>
          <span className="section-kicker">MOVE BETTER TOGETHER</span>
          <h2>Your people make the miles lighter.</h2>
          <p>Invite a friend to try FITQUEST and build a movement habit alongside you.</p>
          <button className="button button-primary" disabled={busy} onClick={() => void invite()}><UsersRound size={16} /> {busy ? "Working…" : "Invite a friend"}</button>
        </div>
        <div className="community-mark"><UsersRound size={42} /><span>{friends.length}</span></div>
      </section>

      {(incomingCode || incomingLocal) && <section className="community-incoming"><div><strong>{incomingCode ? "A FITQUEST member invited you" : `${incomingLocal?.name} invited you to FITQUEST`}</strong><p>{incomingCode && !session ? "Sign in or create an account to add each other to your circles." : "Accept to add this friend to your circle."}</p></div><button className="button button-primary" disabled={busy} onClick={() => void acceptInvite()}>{busy ? "Working…" : "Accept invite"}</button></section>}
      {notice && <p className="community-notice" role="status">{notice}</p>}

      {supabaseConfigured && (
        <section className="community-card community-auth">
          <div className="community-card-heading"><div><span className="section-kicker">SYNCED FRIENDS</span><h3>{session ? "Your FITQUEST account" : "Sign in to sync your circle"}</h3></div><span className="cloud-status">{session ? "CONNECTED" : "ACCOUNT REQUIRED"}</span></div>
          {session ? <div className="community-account"><span>Signed in as {session.user.email}</span><button className="button button-outline" onClick={() => void signOut()}>Sign out</button></div> : <form className="community-auth-form" onSubmit={(event) => void authenticate(event)}>
            <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input type="password" autoComplete={signUp ? "new-password" : "current-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" /></label>
            <div className="community-auth-actions"><button className="button button-primary" disabled={busy}>{busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}</button><button type="button" className="text-link" onClick={() => setSignUp((value) => !value)}>{signUp ? "I already have an account" : "Create an account"}</button></div>
          </form>}
        </section>
      )}

      <section className="community-card">
        <div className="community-card-heading"><div><span className="section-kicker">YOUR CIRCLE</span><h3>{session ? "Friends on FITQUEST" : "Friends on this device"}</h3></div><span>{friends.length} {friends.length === 1 ? "friend" : "friends"}</span></div>
        {friends.length ? <ul className="community-friends">{friends.map((friend) => <li key={friend.id}><span className="friend-avatar">{friend.name.slice(0, 1).toUpperCase()}</span><span><strong>{friend.name}</strong><small>{session ? "Synced friend" : "Accepted invite on this device"}</small></span></li>)}</ul> : <div className="community-empty"><UsersRound size={25} /><strong>Your circle starts with an invite.</strong><span>Invite someone, then accept each other’s invitation.</span></div>}
      </section>
      <p className="community-boundary"><ShieldCheck size={15} /> {supabaseConfigured ? "Cloud invitations use one-time codes that expire after seven days. Keep your Supabase URL and anon key public-only; never add a service-role key to this app." : "Invite links use this app’s current address, so friends need a public HTTPS deployment to open them. Local invites stay on the receiving device. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY plus the supplied SQL schema to enable account-based friend sync."}</p>
    </div>
  );
}
