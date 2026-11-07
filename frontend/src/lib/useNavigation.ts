import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import {
  accurateFix,
  indexNavigation,
  maneuverDistance,
  navigationTarget,
  routeProgress,
  updateRerouteGuard,
  type IndexedNavigation,
  type NavigationBooking,
  type NavigationFix,
  type NavigationProgress,
  type NavigationRoute,
  type RerouteGuard,
} from './navigation';

interface NavigationSession {
  key: string;
  bookingId: string;
  attempted: boolean;
  controller: AbortController | null;
  index: IndexedNavigation | null;
  progressMeters: number;
  guard: RerouteGuard;
  lastFix: NavigationFix | null;
}

interface NavigationSnapshot {
  key: string | null;
  route: NavigationRoute | null;
  progress: NavigationProgress | null;
  loading: boolean;
  error: string | null;
}

const emptySnapshot: NavigationSnapshot = { key: null, route: null, progress: null, loading: false, error: null };

export function useNavigation(booking: NavigationBooking | null, position: NavigationFix | null) {
  const target = navigationTarget(booking);
  const key = target?.key ?? null;
  const keyRef = useRef(key);
  const fixRef = useRef(position);
  keyRef.current = key;
  fixRef.current = position;
  const sessionRef = useRef<NavigationSession | null>(null);
  const [snapshot, setSnapshot] = useState<NavigationSnapshot>(emptySnapshot);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const spokenRef = useRef('');
  const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  const fetchRoute = useCallback(async (session: NavigationSession, fix: NavigationFix) => {
    session.controller?.abort();
    const controller = new AbortController();
    session.controller = controller;
    session.attempted = true;
    session.guard = { deviationUpdates: 0, lastRequestAt: Date.now() };
    const isCurrent = () => sessionRef.current === session && keyRef.current === session.key &&
      session.controller === controller && !controller.signal.aborted;
    setSnapshot((current) => ({
      ...(current.key === session.key ? current : emptySnapshot),
      key: session.key,
      loading: true,
      error: null,
    }));
    try {
      const { route } = await api.post<{ route: NavigationRoute }>(
        `/rider/bookings/${session.bookingId}/navigation`,
        { lat: fix.lat, lng: fix.lng },
        { signal: controller.signal },
      );
      if (!isCurrent()) return;
      const index = indexNavigation(route);
      session.index = index;
      session.progressMeters = 0;
      session.guard.deviationUpdates = 0;
      const latest = fixRef.current;
      const progress = latest && accurateFix(latest) ? routeProgress(index, latest) : null;
      session.progressMeters = progress?.progressMeters ?? 0;
      spokenRef.current = '';
      setSnapshot({ key: session.key, route, progress, loading: false, error: null });
    } catch (error) {
      if (!isCurrent()) return;
      setSnapshot((current) => ({ ...current, loading: false, error: errorMessage(error) }));
    } finally {
      if (session.controller === controller) session.controller = null;
    }
  }, []);

  useEffect(() => {
    const session: NavigationSession | null = key && target ? {
      key,
      bookingId: target.bookingId,
      attempted: false,
      controller: null,
      index: null,
      progressMeters: 0,
      guard: { deviationUpdates: 0, lastRequestAt: 0 },
      lastFix: null,
    } : null;
    sessionRef.current = session;
    setSnapshot({ ...emptySnapshot, key });
    return () => {
      session?.controller?.abort();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [key]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || session.key !== key || !position || session.lastFix === position) return;
    session.lastFix = position;
    if (!session.attempted) {
      void fetchRoute(session, position);
      return;
    }
    if (!session.index) return;
    if (!accurateFix(position)) {
      session.guard.deviationUpdates = 0;
      setSnapshot((current) => ({ ...current, progress: null }));
      return;
    }
    const progress = routeProgress(session.index, position, session.progressMeters);
    session.progressMeters = progress.progressMeters;
    setSnapshot((current) => ({ ...current, progress }));
    if (session.controller) return;
    const decision = updateRerouteGuard(session.guard, position, progress.deviationMeters, Date.now());
    session.guard = decision.guard;
    if (decision.shouldReroute) void fetchRoute(session, position);
  }, [key, position, fetchRoute]);

  const current = snapshot.key === key ? snapshot : { ...emptySnapshot, key };
  const progress = current.progress;
  const speechKey = progress ? `${progress.nextStepIndex}:${progress.distanceToManeuverMeters <= 40 ? 'near' : 'ahead'}` : '';
  const speechText = progress ? `${maneuverDistance(progress.distanceToManeuverMeters)}. ${progress.nextStep.instruction}` : '';
  const canSpeak = Boolean(key && progress && progress.deviationMeters < 60 && !current.loading);

  useEffect(() => {
    spokenRef.current = '';
    if (voiceSupported) window.speechSynthesis.cancel();
    return () => {
      if (voiceSupported) window.speechSynthesis.cancel();
    };
  }, [key, current.route, voiceEnabled, voiceSupported]);

  useEffect(() => {
    if (!voiceSupported || !voiceEnabled || !canSpeak) {
      if (voiceSupported) window.speechSynthesis.cancel();
      return;
    }
    if (!speechKey || spokenRef.current === speechKey) return;
    spokenRef.current = speechKey;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'en-IN';
    window.speechSynthesis.speak(utterance);
  }, [voiceSupported, voiceEnabled, canSpeak, speechKey, speechText]);

  const toggleVoice = useCallback(() => {
    if (!voiceSupported) return;
    window.speechSynthesis.cancel();
    setVoiceEnabled((enabled) => !enabled);
  }, [voiceSupported]);

  const retry = useCallback(() => {
    const session = sessionRef.current;
    const fix = fixRef.current;
    if (!session || keyRef.current !== session.key || !fix || session.controller) return;
    if (session.attempted && Date.now() - session.guard.lastRequestAt < 30_000) return;
    if (session.index && !accurateFix(fix)) return;
    void fetchRoute(session, fix);
  }, [fetchRoute]);

  return { ...current, target, voiceEnabled, voiceSupported, toggleVoice, retry };
}
