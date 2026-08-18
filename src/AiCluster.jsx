/**
 * AiCluster.jsx — KentuOS: superficie chat (messaggi, quick replies, input).
 */
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Home } from 'lucide-react';
import MenuProposalCard from './MenuProposalCard';
import DailyPlanCard from './DailyPlanCard';
import MealDraftTrayBubble from './components/MealDraftTrayBubble';
import WorkoutDraftConfirmation from './components/WorkoutDraftConfirmation';
import MealProposalCards from './components/MealProposalCards';
import NewFoodPreviewCard from './components/NewFoodPreviewCard';
import MealReceiptMessage from './features/chat/MealReceiptMessage';
import LiveMealTray from './features/chat/LiveMealTray';
import WipMealCartBar from './features/wipMealBuilder/components/WipMealCartBar';
import WipMealSmartChips from './features/wipMealBuilder/components/WipMealSmartChips';
import {
  KentuIcon,
  KentuButton,
  KentuInsightHero,
  KentuInsightCard,
} from './components/kentuos/KentuOSUI';
import {
  saveAiFeedback,
  saveChatConversation,
  saveDevNote,
} from './utils/devToolsPersistence';
import { useVoiceChat } from './features/chat/useVoiceChat.js';
import { useVoiceNote } from './features/chat/useVoiceNote.js';
import { transcribeVoiceNote } from './features/chat/transcribeVoiceNote.js';
import ChatInputBar from './features/chat/ChatInputBar.jsx';
import PulsantieraUniversale from './features/chat/PulsantieraUniversale.jsx';
import TypingIndicator from './features/chat/TypingIndicator.jsx';
import KentuAvatar from './features/chat/KentuAvatar.jsx';
import KentuProcessingBanner, { KentuProcessingStatusBadge } from './features/chat/KentuProcessingBanner.jsx';
import { QuickReplyChipRow } from './features/chat/QuickReplyChip.jsx';
import SystemNoticeMessage from './features/chat/SystemNoticeMessage.jsx';
import { isSystemNoticeMessage, shouldRenderSystemNoticeChrome } from './features/chat/chatMessageKind.js';
import QuickEventConfirmMedia from './features/quickEvents/QuickEventConfirmMedia.jsx';
import { resolveCinemaBannerFromChat, resolveQuickEventVideoMaxClampSeconds } from './features/quickEvents/quickEventConfirmAssets.js';
import { draftHasRawMcDriveItems, isMcDriveValidationPenultimateOrLater } from './features/commandTerminal/conversation/mcdriveWizard.js';
import { isPredictiveGreetingMessage } from './features/predictive/predictiveGreeting.js';
import { resolveChatInputPlaceholder } from './features/chat/chatPlaceholder.js';
import {
  AVATAR_MOOD,
  AVATAR_MOOD_LABEL,
  AVATAR_MOOD_SRC,
  detectActiveMealTray,
  detectStrategicConsultContext,
  getAvatarSrcForMood,
  getAvatarVideoForMood,
  resolveAvatarMood,
  resolveMessageAvatarSrc,
} from './features/chat/avatarMood.js';
import { audioBlobToBase64 } from './utils/audioUtils.js';
import { stopSpeaking } from './features/chat/voiceChat.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from './platform/expoNativeCamera.js';

function isFoodPhotoQuickReply(label) {
  const t = String(label || '').trim().toLowerCase();
  return /scatta\s+foto|foto\s+etichett|📷|fotocamera|camera/.test(t);
}

/** Messaggio con widget draft interattivo (vassoio/card): nasconde quick reply duplicate. */
function messageHasInteractiveDraftWidget(msg) {
  if (!msg || msg.isTyping) return false;
  if (msg.mealDraft && !msg.draftResolved) return true;
  if (msg.workoutDraft && !msg.draftResolved) return true;
  if (msg.liveMealTray && msg.liveMealTrayResolved !== true) return true;
  if ((msg.type === 'MCDRIVE_TRAY' || msg.mcdriveWizard) && msg.liveMealTrayResolved !== true) return true;
  if (Array.isArray(msg.mealProposals) && msg.mealProposals.length > 0) return true;
  return false;
}

/** Allinea a stripInvisibleContextFromVisibleUserText in SalaComandi (contesto API non visibile). */
function stripInvisibleContextFromBubble(text) {
  if (text == null || typeof text !== 'string') return text;
  return text
    .replace(/\[CONTEXT_LIVE:[^\]]*\]\s*/gi, '')
    .replace(/\[CONTESTO DI SISTEMA INVISIBILE:[^\]]*\]\s*/gi, '')
    .trim();
}

/** Sezioni separate da doppio a capo → HERO + insight cards. */
function splitAiMessageSections(text) {
  if (text == null) return [];
  const s = String(text);
  if (!s.trim()) return [];
  return s.split(/\n{2,}/).map((block) => block.replace(/\r\n/g, '\n'));
}

export default function AiCluster({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  onSendMessage,
  onLogDinnerOption,
  onLoadAgenda,
  onMealProposalConfirm,
  onMealProposalCancel,
  onMealProposalSwap,
  onDailyPlanConfirm,
  onDailyPlanCancel,
  onGeneratePlanGhostMealDraft,
  activeQuickReplies = [],
  onSlotQuickReplyClick,
  onAcceptAdvice,
  onAcceptMealProposal,
  onEnableMealDraftInteractiveEdit = null,
  onRequestMealItemEdit = null,
  onCancelMealDraftProposal = null,
  onLearnUnresolvedFood = null,
  foodDatabase = {},
  kentuItDatabase = {},
  globalFoodDatabase = {},
  fullHistory = {},
  onDraftConfirm,
  onDraftCancel,
  onDraftRemoveItem,
  onDraftUpdateItemGrams,
  onDraftUpdateMealMeta,
  onDraftUpdateFoodItemName,
  onMcDriveRemoveItem = null,
  onMcDriveUpdateGrams = null,
  onMcDriveUpdateMealTime = null,
  onMcDriveApplyAlternative = null,
  onMcDriveReplaceFromSearch = null,
  getMcDriveMealTargets = null,
  onWorkoutDraftUpdateMeta,
  onWorkoutDraftUpdateExercise,
  onWorkoutDraftRemoveExercise,
  onSaveNewFoodEntry,
  /** Eventi del giorno corrente (timeline/diario) per contesto wizard pianificazione */
  dailyLog = [],
  onBack,
  /** Stessa frase del mount SalaComandi (rotazione kentuIntroPhrases); nessuna seconda estrazione qui. */
  introPhrase = '',
  isProcessing = false,
  onCancelGeneration = null,
  wipMealItems = [],
  wipMealTotals = null,
  wipMealType = 'pranzo',
  onRemoveWipItem,
  onClearWipMeal,
  onAddWipSuggestion,
  mealBuilder = null,
  cancelMealBuilder,
  commitMealBuilder,
  onManualShortcut,
  onOpenManualView = null,
  onOpenActivityView = null,
  onOpenPlanView = null,
  isDiabetesAppMode = false,
  onRequestReport,
  onRequestBarcodeScan,
  quickStripItems = null,
  /** Preferenza TTS iniziale (es. true in modalità diabete se mai salvata). */
  preferVoiceChat = false,
  /** Nome utente (placeholder input + strip TTS). */
  userDisplayName = '',
  /** Snapshot Health Score (avatar dinamico header). */
  healthScore = null,
  /** Giorno di allenamento ON → mood fitness (Trainer) se non in coding/kitchen. */
  isTrainingDay = false,
  /** Click sull'avatar → diagnosi in chat (intent REQUEST_HEALTH_DIAGNOSIS). */
  onRequestHealthDiagnosis = null,
}) {
  const chatFirstName = useMemo(() => {
    const raw = String(userDisplayName || '').trim();
    if (!raw) return '';
    return raw.split(/\s+/)[0];
  }, [userDisplayName]);

  const [isNotesMode, setIsNotesMode] = useState(false);

  const chatInputPlaceholder = useMemo(
    () => resolveChatInputPlaceholder({
      isNotesMode,
      hasImages: chatImages.length > 0,
    }),
    [isNotesMode, chatImages.length],
  );

  const healthAvatarSrc = String(healthScore?.avatar?.src || '/cellula_1_ottimale.png').trim()
    || '/cellula_1_ottimale.png';
  const healthScoreLabel = healthScore?.avatar?.label
    ? `Health Score ${Math.round(Number(healthScore.score) || 0)} · ${healthScore.avatar.label}`
    : 'Health Score';

  const chatEndRef = useRef(null);
  const chatFileInputRef = useRef(null);
  const [consumedClarificationKeys, setConsumedClarificationKeys] = useState(() => new Set());
  const [consumedPredictiveGreetingKeys, setConsumedPredictiveGreetingKeys] = useState(() => new Set());
  const voiceSubmitRef = useRef(null);

  const handlePredictiveGreetingChipClick = useCallback((chip, msg, predictiveKey) => {
    const replyObj = chip && typeof chip === 'object' ? chip : null;
    const replyLabel = replyObj
      ? String(replyObj.label || replyObj.text || '').trim()
      : String(chip || '').trim();
    if (!replyLabel) return;
    setConsumedPredictiveGreetingKeys((prev) => {
      const next = new Set(prev);
      next.add(predictiveKey);
      return next;
    });
    onSlotQuickReplyClick?.(replyLabel, {
      predictiveIntent: replyObj?.intent || replyObj?.action || null,
      predictiveState: msg.predictiveState || null,
      label: replyLabel,
    });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [onSlotQuickReplyClick]);

  const openFoodPhotoCapture = useCallback(async () => {
    try {
      const perm = await requestCameraPermissionsAsync();
      if (perm?.granted) {
        const shot = await launchCameraAsync({ quality: 0.85 });
        if (shot?.uri && !shot.canceled) {
          setChatImages((prev) => [...prev, shot.uri]);
          return;
        }
      }
    } catch {
      // fallback file input
    }
    chatFileInputRef.current?.click();
  }, [setChatImages]);

  // TTS risposta AI (invariato). STT disabilitato — input vocale via useVoiceNote (MediaRecorder).
  const {
    noteTextInteraction,
    markVoiceSubmitForTts,
  } = useVoiceChat({
    chatHistory,
    isProcessing,
    defaultTtsEnabled: preferVoiceChat === true,
    userDisplayName,
    onVoiceSubmit: (text) => {
      voiceSubmitRef.current?.(text);
    },
  });

  const {
    status: voiceNoteStatus,
    formattedDuration: voiceNoteDuration,
    audioBlob: voiceNoteBlob,
    startRecording,
    stopRecording,
    discardNote,
    isSupported: voiceNoteSupported,
    isVoiceNoteActive,
    voiceError,
    clearVoiceError,
    setVoiceErrorMessage,
  } = useVoiceNote({ isProcessing });

  const [isTranscribingVoiceNote, setIsTranscribingVoiceNote] = useState(false);
  const [strategicProcessingLatch, setStrategicProcessingLatch] = useState(false);

  const showTypingIndicator = isProcessing || isTranscribingVoiceNote;

  useEffect(() => {
    if (!isProcessing && !isTranscribingVoiceNote) {
      setStrategicProcessingLatch(false);
    }
  }, [isProcessing, isTranscribingVoiceNote]);

  const isStrategicConsult = useMemo(
    () => detectStrategicConsultContext(chatHistory, {
      forceStrategic: strategicProcessingLatch,
    }),
    [chatHistory, strategicProcessingLatch],
  );

  const hasActiveWorkoutDraft = useMemo(
    () => (chatHistory || []).some((m) => m.workoutDraft && !m.draftResolved),
    [chatHistory],
  );

  const hasActiveMealTray = useMemo(
    () => detectActiveMealTray({
      chatHistory,
      wipMealItems,
      mealBuilder,
    }),
    [chatHistory, wipMealItems, mealBuilder],
  );

  /** Lavagna McDrive attiva: esce dalla cronologia scroll e va nel dock sopra l'input. */
  const dockedMcDriveTrayMsg = useMemo(() => {
    const messages = Array.isArray(chatHistory) ? chatHistory : [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg?.liveMealTrayResolved === true) continue;
      if (msg?.liveMealTray || msg?.type === 'MCDRIVE_TRAY' || msg?.mcdriveWizard) {
        return msg;
      }
    }
    return null;
  }, [chatHistory]);

  const dockedMcDriveTray = dockedMcDriveTrayMsg?.liveMealTray || null;

  const mcdriveTrayItems = useMemo(
    () => (Array.isArray(dockedMcDriveTray?.items) ? dockedMcDriveTray.items : []),
    [dockedMcDriveTray],
  );

  /** Deep Work: lavagna a tutto schermo, cronologia chat nascosta. */
  const isAiGuidedImmersive = Boolean(dockedMcDriveTray);

  const avatarMood = useMemo(
    () => resolveAvatarMood({
      isProcessing,
      isTranscribing: isTranscribingVoiceNote,
      isTyping: showTypingIndicator,
      isStrategicConsult,
      hasActiveMealTray,
      hasActiveWorkoutDraft,
      isTrainingDay: isTrainingDay === true,
    }),
    [
      isProcessing,
      isTranscribingVoiceNote,
      showTypingIndicator,
      isStrategicConsult,
      hasActiveMealTray,
      hasActiveWorkoutDraft,
      isTrainingDay,
    ],
  );

  const typingIndicatorLabel = useMemo(() => {
    const base = AVATAR_MOOD_LABEL[avatarMood] || AVATAR_MOOD_LABEL[AVATAR_MOOD.CODING];
    return `${base}...`;
  }, [avatarMood]);

  /**
   * Elaborazione AI: poster mood (0ms) + mp4 se disponibile (es. Hacker4animazione).
   * Solo UI — non attende decode e non blocca setIsProcessing / fetch.
   */
  const typingAvatarPosterSrc = getAvatarSrcForMood(avatarMood, AVATAR_MOOD_SRC[AVATAR_MOOD.CODING]);
  const typingAvatarVideoSrc = showTypingIndicator
    ? getAvatarVideoForMood(avatarMood)
    : '';

  /** Chiavi quick-event già riprodotte in fascia (one-shot). */
  const [dismissedCinemaKeys, setDismissedCinemaKeys] = useState(() => new Set());
  /** Video sollevato nell'header (sostituisce mascotte + titolo). */
  const [hoistedVideo, setHoistedVideo] = useState(null);
  /** Utente ha chiuso manualmente il video di elaborazione (typing). */
  const [processingVideoDismissed, setProcessingVideoDismissed] = useState(false);
  /** Tick per far scadere la fascia quando il quick-event non è più “fresco”. */
  const [cinemaClock, setCinemaClock] = useState(0);

  const quickEventCinema = useMemo(
    () => resolveCinemaBannerFromChat(chatHistory),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cinemaClock forza re-check freschezza
    [chatHistory, cinemaClock],
  );

  useEffect(() => {
    if (!quickEventCinema) return undefined;
    const id = window.setInterval(() => {
      setCinemaClock((n) => n + 1);
    }, 2000);
    return () => window.clearInterval(id);
  }, [quickEventCinema?.messageKey]);

  const cinemaBannerCandidate = useMemo(() => {
    if (
      quickEventCinema
      && (quickEventCinema.messageKey == null
        || !dismissedCinemaKeys.has(quickEventCinema.messageKey))
    ) {
      return {
        posterSrc: quickEventCinema.posterSrc,
        videoSrc: quickEventCinema.videoSrc,
        label: quickEventCinema.label,
        loop: false,
        messageKey: quickEventCinema.messageKey,
        maxClampSeconds: quickEventCinema.maxClampSeconds ?? null,
        source: 'quick_event',
      };
    }
    if (showTypingIndicator) {
      return {
        posterSrc: typingAvatarPosterSrc,
        videoSrc: typingAvatarVideoSrc || null,
        label: typingIndicatorLabel,
        loop: Boolean(typingAvatarVideoSrc),
        messageKey: null,
        source: 'processing',
      };
    }
    return null;
  }, [
    quickEventCinema,
    dismissedCinemaKeys,
    showTypingIndicator,
    typingAvatarPosterSrc,
    typingAvatarVideoSrc,
    typingIndicatorLabel,
  ]);

  useEffect(() => {
    if (!cinemaBannerCandidate) {
      setHoistedVideo(null);
      return;
    }
    if (
      cinemaBannerCandidate.source === 'processing'
      && processingVideoDismissed
    ) {
      setHoistedVideo(null);
      return;
    }
    if (
      cinemaBannerCandidate.messageKey != null
      && dismissedCinemaKeys.has(cinemaBannerCandidate.messageKey)
    ) {
      setHoistedVideo(null);
      return;
    }
    setHoistedVideo(cinemaBannerCandidate);
  }, [cinemaBannerCandidate, dismissedCinemaKeys, processingVideoDismissed]);

  const isMcDriveProcessingVideo = Boolean(
    hoistedVideo?.source === 'processing' && dockedMcDriveTray,
  );

  const isMcDrivePenultimateOrLater = useMemo(
    () => isMcDriveValidationPenultimateOrLater(mcdriveTrayItems),
    [mcdriveTrayItems],
  );

  const isMcDriveTailLoopActive = useMemo(() => {
    if (!isMcDriveProcessingVideo || !isMcDrivePenultimateOrLater) return false;
    return draftHasRawMcDriveItems(mcdriveTrayItems) || showTypingIndicator;
  }, [
    isMcDriveProcessingVideo,
    isMcDrivePenultimateOrLater,
    mcdriveTrayItems,
    showTypingIndicator,
  ]);

  useEffect(() => {
    if (!showTypingIndicator) {
      setProcessingVideoDismissed(false);
    }
  }, [showTypingIndicator]);

  const dismissHoistedVideo = useCallback(() => {
    if (hoistedVideo?.source === 'processing') {
      setProcessingVideoDismissed(true);
    }
    const key = hoistedVideo?.messageKey;
    if (key != null) {
      setDismissedCinemaKeys((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }
    setHoistedVideo(null);
  }, [hoistedVideo?.messageKey]);

  const handleHoistedVideoEnded = useCallback(() => {
    const key = hoistedVideo?.messageKey;
    if (key == null) return;
    setDismissedCinemaKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setHoistedVideo(null);
  }, [hoistedVideo?.messageKey]);

  const handleHoistVideoFromMessage = useCallback((payload) => {
    if (!payload?.videoSrc) return;
    if (payload.messageKey != null) {
      setDismissedCinemaKeys((prev) => {
        if (!prev.has(payload.messageKey)) return prev;
        const next = new Set(prev);
        next.delete(payload.messageKey);
        return next;
      });
    }
    setProcessingVideoDismissed(false);
    setHoistedVideo({
      posterSrc: payload.posterSrc || payload.videoSrc,
      videoSrc: payload.videoSrc,
      label: payload.label || 'Conferma evento',
      loop: payload.loop === true,
      messageKey: payload.messageKey ?? null,
      maxClampSeconds: payload.maxClampSeconds
        ?? resolveQuickEventVideoMaxClampSeconds(payload.videoSrc),
      source: payload.source || 'quick_event',
    });
  }, []);

  const headerAvatarLabel = healthScoreLabel;

  /** Fingerprint lavagna attiva (dock): scroll cronologia resta indipendente. */
  const scrollChatToBottom = useCallback((behavior = 'smooth') => {
    const node = chatEndRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior, block: 'end' });
  }, []);

  useEffect(() => {
    scrollChatToBottom('smooth');
    const t1 = window.setTimeout(() => scrollChatToBottom('smooth'), 80);
    const t2 = window.setTimeout(() => scrollChatToBottom('auto'), 220);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // Non dipendere dalla lavagna McDrive: i nuovi item nascono in cima, niente auto-scroll.
  }, [chatHistory, showTypingIndicator, scrollChatToBottom]);

  const suppressQuickReplies = useMemo(
    () => (chatHistory || []).some(
      (m) => m.mealProposal
        || m.dailyPlan
        || (m.mealDraft && !m.draftResolved)
        || (m.workoutDraft && !m.draftResolved)
        || (Array.isArray(m.mealProposals) && m.mealProposals.length > 0),
    ),
    [chatHistory]
  );

  const visibleQuickReplies = useMemo(() => {
    const normalized = (activeQuickReplies || []).map((entry) => {
      if (entry && typeof entry === 'object') {
        return {
          label: String(entry.label || entry.text || '').trim(),
          foodDbKey: entry.foodDbKey ?? entry.id ?? null,
          foodName: entry.foodName || entry.name || null,
          grams: entry.grams ?? null,
          action: entry.action || entry.intent || null,
          intent: entry.intent || entry.action || null,
          variant: entry.variant || null,
        };
      }
      return {
        label: String(entry ?? '').trim(),
        foodDbKey: null,
        foodName: null,
        grams: null,
        action: null,
        intent: null,
        variant: null,
      };
    }).filter((e) => e.label);
    const withoutWorkoutSaveDupes = !hasActiveWorkoutDraft
      ? normalized
      : normalized.filter(
        (entry) => !/^s[iì]\s*,\s*salva\b/i.test(entry.label),
      );
    // Lavagna McDrive attiva: i pulsanti Annulla/Salva/Aggiungi vivono solo nel footer della card.
    if (dockedMcDriveTray) {
      const mcdriveTrayIntents = new Set([
        'CANCEL_MCDRIVE_WIZARD',
        'SAVE_MCDRIVE_MEAL',
        'ADD_MORE_MCDRIVE',
        'FINISH_MCDRIVE_WIZARD',
      ]);
      return withoutWorkoutSaveDupes.filter(
        (entry) => !mcdriveTrayIntents.has(String(entry.intent || entry.action || '').toUpperCase()),
      );
    }
    return withoutWorkoutSaveDupes;
  }, [activeQuickReplies, hasActiveWorkoutDraft, dockedMcDriveTray]);

  const handlePulsantieraSend = useCallback((text, options) => {
    if (isProcessing || isNotesMode) return;
    const trimmed = String(text || '').trim();
    const intent = String(options?.intent || '').trim();
    const mealType = String(options?.mealType || options?.mealTypeHint || '').trim() || null;
    const allowEmpty = intent === 'START_MCDRIVE_WIZARD' && Boolean(mealType);
    if (!trimmed && !allowEmpty) return;
    if (isVoiceNoteActive) {
      discardNote();
    }
    noteTextInteraction();
    setChatInput('');
    onSendMessage(trimmed, {
      fromInput: true,
      ...(intent ? { intent } : {}),
      ...(mealType ? { mealType, mealTypeHint: mealType } : {}),
      ...(options?.editingMealId != null ? { editingMealId: options.editingMealId } : {}),
      ...(Array.isArray(options?.editingFoods) ? { editingFoods: options.editingFoods } : {}),
      ...(options?.editingExactTime != null ? { editingExactTime: options.editingExactTime } : {}),
      ...(options?.skipUserBubble === true ? { skipUserBubble: true } : {}),
    });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [
    isProcessing,
    isNotesMode,
    isVoiceNoteActive,
    discardNote,
    noteTextInteraction,
    setChatInput,
    onSendMessage,
  ]);

  const handlePulsantieraOpenManual = useCallback((payload = null) => {
    if (typeof onOpenManualView === 'function') {
      onOpenManualView(payload);
      return;
    }
    onManualShortcut?.('meal');
  }, [onOpenManualView, onManualShortcut]);

  const handlePulsantieraOpenActivity = useCallback((payload) => {
    if (typeof onOpenActivityView === 'function') {
      onOpenActivityView(payload);
      return;
    }
    onManualShortcut?.('workout');
  }, [onOpenActivityView, onManualShortcut]);

  const handlePulsantieraOpenPlan = useCallback(() => {
    if (typeof onOpenPlanView === 'function') {
      onOpenPlanView();
    }
  }, [onOpenPlanView]);

  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [devToolsToast, setDevToolsToast] = useState('');
  const toolsMenuRef = useRef(null);
  const chatSessionIdRef = useRef(
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
  );

  const showDevToast = useCallback((message) => {
    setDevToolsToast(message);
    window.setTimeout(() => setDevToolsToast(''), 2200);
  }, []);

  useEffect(() => {
    if (!showToolsMenu) return undefined;
    const onPointerDown = (event) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target)) {
        setShowToolsMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [showToolsMenu]);

  const handleToolsButtonClick = useCallback(() => {
    if (isNotesMode) {
      setIsNotesMode(false);
      setShowToolsMenu(false);
      showDevToast('Modalità note disattivata');
      return;
    }
    setShowToolsMenu((prev) => !prev);
  }, [isNotesMode, showDevToast]);

  const handleActivateNotesMode = useCallback(() => {
    setIsNotesMode(true);
    setShowToolsMenu(false);
    showDevToast('Modalità note attiva');
  }, [showDevToast]);

  const handleFlagAnomaly = useCallback(async () => {
    try {
      const lastMessages = (chatHistory || []).slice(-2);
      if (!lastMessages.length) {
        showDevToast('Nessuno scambio da segnalare');
        setShowToolsMenu(false);
        return;
      }
      await saveAiFeedback({
        messages: lastMessages,
        note: "Segnalato manualmente dall'utente per risposta anomala",
      });
      showDevToast('Segnalazione salvata');
    } catch (err) {
      console.error('[DevTools] saveAiFeedback failed', err);
      showDevToast('Segnalazione fallita');
    } finally {
      setShowToolsMenu(false);
    }
  }, [chatHistory, showDevToast]);

  const handleSaveChat = useCallback(async () => {
    try {
      const messages = Array.isArray(chatHistory) ? chatHistory : [];
      if (!messages.length) {
        showDevToast('Nessuna chat da salvare');
        setShowToolsMenu(false);
        return;
      }
      await saveChatConversation({
        messages,
        sessionId: chatSessionIdRef.current,
      });
      showDevToast('Chat salvata');
    } catch (err) {
      console.error('[DevTools] saveChatConversation failed', err);
      showDevToast('Salvataggio chat fallito');
    } finally {
      setShowToolsMenu(false);
    }
  }, [chatHistory, showDevToast]);

  const handleRequestReportFromTools = useCallback(() => {
    setShowToolsMenu(false);
    onRequestReport?.();
  }, [onRequestReport]);

  const handleBarcodeTool = useCallback(() => {
    // 1. Chiudi menu Tools
    setShowToolsMenu(false);
    // 2–3. Chiudi chat + apri FastMealLogger con scanner (SalaComandi)
    onRequestBarcodeScan?.();
  }, [onRequestBarcodeScan]);

  const handleComposerSubmit = useCallback(async (rawText) => {
    if (isProcessing) return;

    if (isVoiceNoteActive) {
      discardNote();
    }
    noteTextInteraction();

    const text = String(rawText || '').trim();

    if (isNotesMode) {
      if (!text) return;
      try {
        await saveDevNote({ text });
        setChatInput('');
        showDevToast('Nota salvata');
      } catch (err) {
        console.error('[DevTools] saveDevNote failed', err);
        showDevToast('Salvataggio nota fallito');
      }
      return;
    }

    if (!text && !(chatImages?.length > 0)) return;

    setChatInput('');
    onSendMessage(text, { fromInput: true });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [
    isProcessing,
    isVoiceNoteActive,
    discardNote,
    noteTextInteraction,
    isNotesMode,
    setChatInput,
    showDevToast,
    onSendMessage,
    chatImages,
  ]);

  const handleSeedConsumed = useCallback(() => {
    setChatInput('');
  }, [setChatInput]);

  const handleSendVoiceNote = useCallback(async () => {
    if (!voiceNoteBlob || isProcessing || isTranscribingVoiceNote) return;

    clearVoiceError();
    setIsTranscribingVoiceNote(true);

    try {
      const base64 = await audioBlobToBase64(voiceNoteBlob);
      const mimeType = voiceNoteBlob.type || 'audio/webm';
      const transcription = await transcribeVoiceNote(base64, mimeType);

      discardNote();
      markVoiceSubmitForTts();
      stopSpeaking();

      if (isNotesMode) {
        setChatInput(transcription);
        return;
      }

      onSendMessage(transcription, { fromInput: true, fromVoice: true });
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      console.error('[AiCluster] voice note transcription failed', error);
      const message = String(error?.message || '').trim();
      if (message === 'empty_transcription') {
        setVoiceErrorMessage('Non ho capito nulla nell\'audio. Riprova parlando più vicino al microfono.');
      } else if (message === 'missing_audio_data' || message === 'missing_blob') {
        setVoiceErrorMessage('Registrazione audio non valida. Riprova.');
      } else {
        setVoiceErrorMessage('Trascrizione non riuscita. Riprova tra poco.');
      }
    } finally {
      setIsTranscribingVoiceNote(false);
    }
  }, [
    voiceNoteBlob,
    isProcessing,
    isTranscribingVoiceNote,
    clearVoiceError,
    discardNote,
    markVoiceSubmitForTts,
    isNotesMode,
    setChatInput,
    onSendMessage,
    setVoiceErrorMessage,
  ]);

  // Invio da sessione vocale (stesso percorso dell'input, con TTS abilitato per la risposta).
  voiceSubmitRef.current = (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || isProcessing) return;
    stopSpeaking();
    if (isNotesMode) {
      setChatInput(trimmed);
      return;
    }
    onSendMessage(trimmed, { fromInput: true, fromVoice: true });
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const handleWorkspaceHomeClick = useCallback(() => {
    if (hoistedVideo) {
      dismissHoistedVideo();
    }
    discardNote();
    stopSpeaking();
    onBack?.();
  }, [dismissHoistedVideo, discardNote, hoistedVideo, onBack]);

  return (
    <div
      className="view-animate ai-cluster-root kentu-os flex flex-col bg-zinc-950"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}
    >
      <header
        className={[
          'relative flex shrink-0 flex-col overflow-hidden border-b border-zinc-800 bg-zinc-950',
          'transition-all duration-500 ease-in-out',
          hoistedVideo ? 'h-64' : 'h-20',
        ].join(' ')}
      >
        {hoistedVideo ? (
          <div className="relative h-full min-h-0 w-full">
            <KentuProcessingBanner
              variant="header"
              posterSrc={hoistedVideo.posterSrc}
              videoSrc={hoistedVideo.videoSrc}
              label={hoistedVideo.label}
              loop={
                isMcDriveProcessingVideo
                  ? (isMcDrivePenultimateOrLater ? false : hoistedVideo.loop)
                  : hoistedVideo.loop
              }
              clampToFirstSeconds={isMcDriveProcessingVideo ? 3 : null}
              isPenultimateOrLater={!isMcDriveProcessingVideo || isMcDrivePenultimateOrLater}
              tailLoopFromSeconds={isMcDriveProcessingVideo ? 8 : null}
              tailLoopWhileActive={isMcDriveTailLoopActive}
              maxClampSeconds={hoistedVideo.maxClampSeconds ?? null}
              onVideoEnded={handleHoistedVideoEnded}
            />
            <div className="absolute right-3 top-3 z-10 flex shrink-0 items-center">
              {typeof onBack === 'function' ? (
                <button
                  type="button"
                  onClick={handleWorkspaceHomeClick}
                  aria-label="Torna alla Home"
                  title="Home"
                  className={[
                    'inline-flex h-10 w-10 items-center justify-center rounded-full border',
                    'border-zinc-700/80 bg-zinc-950/75 text-cyan-200 backdrop-blur-sm transition',
                    'hover:border-cyan-500/45 hover:text-cyan-100',
                    'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
                  ].join(' ')}
                >
                  <Home className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                if (typeof onRequestHealthDiagnosis === 'function') {
                  setStrategicProcessingLatch(true);
                  onRequestHealthDiagnosis(healthScore);
                }
              }}
              disabled={typeof onRequestHealthDiagnosis !== 'function' || isProcessing}
              aria-label={`${headerAvatarLabel}. Tocca per la diagnosi.`}
              title={headerAvatarLabel}
              className={[
                'flex shrink-0 items-center justify-center bg-transparent p-0 transition',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-0',
                typeof onRequestHealthDiagnosis === 'function' && !isProcessing
                  ? 'cursor-pointer opacity-100 hover:opacity-90 active:scale-95'
                  : 'cursor-default opacity-80',
              ].join(' ')}
            >
              <KentuAvatar
                size="header"
                src={healthAvatarSrc}
                fit="contain"
                alt=""
                className="bg-transparent"
              />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
              <span className="truncate text-sm font-semibold tracking-wide text-zinc-100">
                Kentu AI Workspace
              </span>
              {introPhrase ? (
                <span className="max-w-full truncate text-[0.65rem] text-zinc-500" title={introPhrase}>
                  {introPhrase}
                </span>
              ) : healthScore != null ? (
                <span className="max-w-full truncate text-[0.65rem] text-zinc-500">
                  Score {Math.round(Number(healthScore.score) || 0)} · {healthScore?.avatar?.label || '—'}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center">
              {typeof onBack === 'function' ? (
                <button
                  type="button"
                  onClick={handleWorkspaceHomeClick}
                  aria-label="Torna alla Home"
                  title="Home"
                  className={[
                    'inline-flex h-10 w-10 items-center justify-center rounded-full border',
                    'border-zinc-700 bg-zinc-900 text-cyan-200 transition',
                    'hover:border-cyan-500/45 hover:text-cyan-100',
                    'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
                  ].join(' ')}
                >
                  <Home className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {hoistedVideo ? (
        <div
          className={[
            'flex w-full shrink-0 justify-center border-b border-white/10 bg-white/[0.05] px-4 py-2',
            'backdrop-blur-md transition-all duration-500 ease-in-out',
          ].join(' ')}
          aria-live="polite"
        >
          <KentuProcessingStatusBadge
            label={hoistedVideo.label}
            busy={Boolean(hoistedVideo.videoSrc)}
          />
        </div>
      ) : null}

      <div
        className={`chat-container flex min-h-0 flex-1 flex-col${isAiGuidedImmersive ? ' chat-container--ai-guided' : ''}`}
        style={{
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {!isAiGuidedImmersive ? (
          <WipMealCartBar
            items={wipMealItems}
            totals={wipMealTotals}
            mealType={wipMealType}
            onRemoveItem={onRemoveWipItem}
            onClear={onClearWipMeal}
          />
        ) : null}
        {!isAiGuidedImmersive ? (
        <div className="chat-messages flex-1 overflow-y-auto" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch', paddingRight: '5px' }}>
          {chatHistory.filter((msg) => {
            if (msg?.predictiveSuperseded === true) return false;
            // Lavagna attiva: solo nel dock sopra l'input, non in cronologia.
            if (dockedMcDriveTrayMsg && msg === dockedMcDriveTrayMsg) return false;
            if (
              msg?.liveMealTrayResolved !== true
              && (msg?.liveMealTray || msg?.type === 'MCDRIVE_TRAY' || msg?.mcdriveWizard)
            ) {
              return false;
            }
            return true;
          }).map((msg, idx) => {
            const isQuickEventConfirm = Boolean(
              msg?.quickEventConfirm || msg?.type === 'QUICK_EVENT_CONFIRM',
            );
            return (
            <div
              key={idx}
              className={`flex w-full flex-col gap-1.5 ${
                isQuickEventConfirm
                  ? 'items-stretch px-0'
                  : msg.sender === 'ai'
                    ? 'items-start'
                    : 'items-end'
              }`}
            >
              {msg.sender === 'ai' && msg.mealProposal && !msg.isTyping ? (
                <div style={{ width: '100%' }}>
                  <MenuProposalCard
                    proposal={msg.mealProposal}
                    onConfirm={onMealProposalConfirm}
                    onCancel={onMealProposalCancel}
                    onSwap={onMealProposalSwap}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.dailyPlan && !msg.isTyping ? (
                <div style={{ width: '100%' }}>
                  {msg.text?.trim() ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
                      {splitAiMessageSections(msg.text).map((block, si) =>
                        si === 0 ? (
                          <KentuInsightHero key={si} block={block} />
                        ) : (
                          <KentuInsightCard key={si} block={block} />
                        )
                      )}
                    </div>
                  ) : null}
                  <DailyPlanCard
                    planData={msg.dailyPlan}
                    onConfirm={onDailyPlanConfirm}
                    onCancel={onDailyPlanCancel}
                    onGeneratePlanGhostMealDraft={onGeneratePlanGhostMealDraft}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.mealDraft && !msg.draftResolved && !msg.isTyping ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {msg.text ? (
                    splitAiMessageSections(msg.text).map((block, si) =>
                      si === 0 ? (
                        <KentuInsightHero key={`draft-text-${si}`} block={block} />
                      ) : (
                        <KentuInsightCard key={`draft-text-${si}`} block={block} />
                      )
                    )
                  ) : null}
                  <MealDraftTrayBubble
                    mealDraft={msg.mealDraft}
                    draftId={msg.draftId}
                    onConfirm={onDraftConfirm}
                    onCancel={onDraftCancel}
                    onRemoveItem={onDraftRemoveItem}
                    onUpdateGrams={(itemIndex, grams) => {
                      onDraftUpdateItemGrams?.(msg.draftId, itemIndex, grams);
                    }}
                    onUpdateMealMeta={onDraftUpdateMealMeta}
                  />
                </div>
              ) : msg.sender === 'ai' && msg.workoutDraft && !msg.draftResolved && !msg.isTyping ? (
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {msg.text ? (
                    splitAiMessageSections(msg.text).map((block, si) =>
                      si === 0 ? (
                        <KentuInsightHero key={`workout-draft-text-${si}`} block={block} />
                      ) : (
                        <KentuInsightCard key={`workout-draft-text-${si}`} block={block} />
                      )
                    )
                  ) : null}
                  <WorkoutDraftConfirmation
                    workoutDraft={msg.workoutDraft}
                    draftId={msg.draftId}
                    onConfirm={onDraftConfirm}
                    onCancel={onDraftCancel}
                    onRemoveExercise={onWorkoutDraftRemoveExercise}
                    onUpdateWorkoutMeta={onWorkoutDraftUpdateMeta}
                    onUpdateExercise={onWorkoutDraftUpdateExercise}
                  />
                </div>
              ) : msg.sender === 'ai' ? (
                msg.isTyping ? (
                  <TypingIndicator
                    avatarSrc={typingAvatarPosterSrc}
                    avatarVideoSrc={null}
                    hideAvatar={Boolean(hoistedVideo)}
                    label={typingIndicatorLabel}
                  />
                ) : msg.mealReceipt && typeof msg.mealReceipt === 'object' ? (
                  <div className="w-full max-w-full box-border">
                    <MealReceiptMessage receipt={msg.mealReceipt} />
                  </div>
                ) : msg.quickEventConfirm || msg.type === 'QUICK_EVENT_CONFIRM' ? (
                  <div className="w-full max-w-full box-border border-0 bg-transparent p-0 m-0 shadow-none">
                    <QuickEventConfirmMedia
                      imageSrc={msg.quickEventConfirm?.imageSrc || msg.imageSrc}
                      videoSrc={msg.quickEventConfirm?.videoSrc || msg.videoSrc || null}
                      title={msg.quickEventConfirm?.title || msg.text || msg.displayText || ''}
                      subtitle={msg.quickEventConfirm?.subtitle || ''}
                      headerOwnsVideo={
                        Boolean(hoistedVideo?.videoSrc)
                        && Boolean(String(msg.quickEventConfirm?.videoSrc || msg.videoSrc || '').trim())
                        && String(msg.quickEventConfirm?.videoSrc || msg.videoSrc || '').trim()
                          === String(hoistedVideo.videoSrc || '').trim()
                      }
                      videoDismissed={
                        Boolean(String(msg.quickEventConfirm?.videoSrc || msg.videoSrc || '').trim())
                        && !(
                          hoistedVideo?.videoSrc
                          && String(hoistedVideo.videoSrc).trim()
                            === String(msg.quickEventConfirm?.videoSrc || msg.videoSrc || '').trim()
                        )
                      }
                      onHoistVideo={handleHoistVideoFromMessage}
                      onReopenVideo={() => {
                        handleHoistVideoFromMessage({
                          videoSrc: msg.quickEventConfirm?.videoSrc || msg.videoSrc || null,
                          posterSrc: msg.quickEventConfirm?.imageSrc || msg.imageSrc || null,
                          label: msg.quickEventConfirm?.title || msg.text || msg.displayText || 'Conferma evento',
                          loop: false,
                          messageKey: msg.quickEventConfirm?.messageKey ?? msg.id ?? idx,
                          maxClampSeconds: msg.quickEventConfirm?.maxClampSeconds
                            ?? resolveQuickEventVideoMaxClampSeconds(
                              msg.quickEventConfirm?.videoSrc || msg.videoSrc,
                            ),
                          source: 'quick_event',
                        });
                      }}
                      timestamp={
                        msg.timestamp
                        ?? msg.createdAt
                        ?? msg.quickEventConfirm?.timestamp
                        ?? msg.quickEventConfirm?.createdAt
                        // Cronologia senza ts: 0 → non recente → niente autoplay maxi-card
                        ?? 0
                      }
                    />
                  </div>
                ) : msg.liveMealTray || msg.type === 'MCDRIVE_TRAY' || msg.mcdriveWizard ? (
                  <div className="flex w-full max-w-full flex-col gap-2.5 box-border">
                    <div className="kentu-ai-bubble-stack flex w-full min-w-0 flex-col gap-2.5">
                      {String(msg.text || msg.displayText || '').trim()
                        ? splitAiMessageSections(msg.text || msg.displayText).map((block, si) =>
                          si === 0 ? (
                            <KentuInsightHero key={`mcdrive-text-${si}`} block={block} />
                          ) : (
                            <KentuInsightCard key={`mcdrive-text-${si}`} block={block} />
                          ))
                        : (
                          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-300">
                            {(() => {
                              const tray = msg.liveMealTray;
                              const items = Array.isArray(tray?.items) ? tray.items : [];
                              const totals = tray?.resolvedTotals || tray?.totals || {};
                              const names = items
                                .map((it) => String(it?.foodName || it?.name || '').trim())
                                .filter(Boolean)
                                .slice(0, 5);
                              const kcal = Math.round(Number(totals.kcal) || 0);
                              return names.length
                                ? `📋 ${names.join(', ')}${items.length > names.length ? '…' : ''} · ${kcal} kcal`
                                : '📋 Pasto McDrive chiuso.';
                            })()}
                          </div>
                        )}
                    </div>
                  </div>
                ) : isSystemNoticeMessage(msg) ? (
                  <SystemNoticeMessage message={msg} />
                ) : (
                  <div
                    className={[
                      'flex w-full max-w-[min(92%,28rem)] flex-col gap-2.5',
                      isPredictiveGreetingMessage(msg) ? 'kentu-predictive-greeting-block' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {shouldRenderSystemNoticeChrome(msg) ? (
                      <SystemNoticeMessage message={msg} />
                    ) : (
                      <div className="kentu-ai-row flex w-full items-end gap-3">
                        <KentuAvatar
                          size="sm"
                          src={resolveMessageAvatarSrc(msg)}
                          fit="contain"
                          className="mb-0.5 shrink-0 self-end"
                          alt="Kentu AI"
                        />
                        <div className="kentu-ai-bubble-stack flex min-w-0 flex-1 flex-col gap-2.5">
                          {msg.local === true || msg.sourceTag === 'local_receptionist' ? (
                            <div
                              className="kentu-local-receptionist-badge"
                              style={{
                                alignSelf: 'flex-start',
                                fontSize: 11,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                opacity: 0.7,
                                fontWeight: 600,
                              }}
                            >
                              Risposta istantanea · locale
                            </div>
                          ) : null}
                          {splitAiMessageSections(msg.text).map((block, si) =>
                            si === 0 ? (
                              <KentuInsightHero key={si} block={block} />
                            ) : (
                              <KentuInsightCard key={si} block={block} />
                            )
                          )}
                          {msg.suggestedAction
                            && !msg.adviceAccepted
                            && typeof onAcceptAdvice === 'function' ? (
                              <button
                                type="button"
                                className="kentu-advice-accept-btn"
                                onClick={() => {
                                  void onAcceptAdvice(msg.suggestedAction, msg.adviceId);
                                }}
                              >
                                <span className="kentu-advice-accept-btn__icon" aria-hidden>
                                  ⚡
                                </span>
                                <span className="kentu-advice-accept-btn__label">
                                  Procedi e inserisci:
                                  {' '}
                                  {Math.round(Number(msg.suggestedAction.grams) || 0)}
                                  g
                                  {' '}
                                  {msg.suggestedAction.foodName}
                                </span>
                              </button>
                            ) : null}
                          {isPredictiveGreetingMessage(msg)
                            && Array.isArray(msg.quickReplies)
                            && msg.quickReplies.length > 0
                            && !consumedPredictiveGreetingKeys.has(`pred-${idx}`)
                            && msg.predictiveSuperseded !== true ? (
                              <QuickReplyChipRow
                                replies={msg.quickReplies}
                                disabled={isProcessing}
                                align="start"
                                onChipClick={(chip) => {
                                  handlePredictiveGreetingChipClick(chip, msg, `pred-${idx}`);
                                }}
                              />
                            ) : null}
                        </div>
                      </div>
                    )}
                    {msg.type === 'ADVICE'
                      && Array.isArray(msg.mealProposals)
                      && msg.mealProposals.length > 0
                      && typeof onAcceptMealProposal === 'function' ? (
                        <MealProposalCards
                          proposals={msg.mealProposals}
                          adviceId={msg.adviceId}
                          loadedProposalIds={msg.mealProposalsLoadedIds || []}
                          foodDatabase={foodDatabase}
                          kentuItDatabase={kentuItDatabase}
                          globalFoodDatabase={globalFoodDatabase}
                          fullHistory={fullHistory}
                          onConfirm={onAcceptMealProposal}
                          onLearnUnresolvedFood={onLearnUnresolvedFood}
                          interactiveEdit={msg.mealDraftInteractiveEdit === true}
                          onRequestItemEdit={onRequestMealItemEdit}
                          onCancelDraft={onCancelMealDraftProposal}
                          onEnableInteractiveEdit={onEnableMealDraftInteractiveEdit}
                        />
                      ) : null}
                    {Array.isArray(msg.wipSuggestions)
                      && msg.wipSuggestions.length > 0
                      && typeof onAddWipSuggestion === 'function' ? (
                        <WipMealSmartChips
                          suggestions={msg.wipSuggestions}
                          addedChipIds={msg.wipAddedChipIds || []}
                          onAddSuggestion={(suggestion, chipId) => {
                            onAddWipSuggestion(suggestion, chipId, msg.adviceId);
                          }}
                        />
                      ) : null}
                    {msg.type === 'NEW_FOOD_PREVIEW'
                      && msg.newFoodDraft
                      && typeof onSaveNewFoodEntry === 'function' ? (
                        <NewFoodPreviewCard
                          draft={msg.newFoodDraft}
                          onSave={onSaveNewFoodEntry}
                        />
                      ) : null}
                    {(msg.type === 'REQUEST_FOOD_PHOTO' || msg.requestFoodPhoto === true) && !msg.isTyping ? (
                      <div className="kentu-quick-row kentu-quick-row--clarification" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                        <KentuButton
                          variant="secondary"
                          className="kentu-btn--clarification"
                          type="button"
                          onClick={() => {
                            openFoodPhotoCapture();
                            setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                          }}
                        >
                          📷 Scatta foto etichetta
                        </KentuButton>
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                <div className="kentu-user-capsule">
                  <div className="kentu-user-capsule__label">
                    {(chatFirstName || 'Marco').toUpperCase()}
                  </div>
                  {stripInvisibleContextFromBubble(msg.text)}
                </div>
              )}
              {msg.quickReplies && msg.quickReplies.length > 0 && !msg.isTyping && !messageHasInteractiveDraftWidget(msg) && (() => {
                if (isPredictiveGreetingMessage(msg)) return null;

                const clarificationKey = `clr-${idx}`;
                const isClarification = msg.clarification === true
                  || msg.type === 'ASK_CLARIFICATION'
                  || msg.type === 'REQUEST_FOOD_PHOTO'
                  || msg.requestFoodPhoto === true;
                if (isClarification && consumedClarificationKeys.has(clarificationKey)) return null;
                // Evita doppio pulsante camera se già mostrato sopra per REQUEST_FOOD_PHOTO.
                const replies = (msg.type === 'REQUEST_FOOD_PHOTO' || msg.requestFoodPhoto)
                  ? msg.quickReplies.filter((r) => {
                    const label = typeof r === 'object' ? r.label : r;
                    return !isFoodPhotoQuickReply(label) && !(r && typeof r === 'object' && r.action === 'photo');
                  })
                  : msg.quickReplies;
                if (replies.length === 0) return null;
                return (
                <div
                  className={`kentu-quick-row${isClarification ? ' kentu-quick-row--clarification' : ''}`}
                  style={{ justifyContent: msg.sender === 'ai' ? 'flex-start' : 'flex-end' }}
                >
                  {replies.map((reply, rIdx) => {
                    const morningActivityIds = ['weights', 'cardio', 'rest'];
                    const replyObj = reply && typeof reply === 'object' ? reply : null;
                    const replyLabel = replyObj
                      ? String(replyObj.label || replyObj.text || '').trim()
                      : String(reply || '').trim();
                    if (!replyLabel) return null;
                    return (
                      <KentuButton
                        key={rIdx}
                        variant="secondary"
                        className={isClarification ? 'kentu-btn--clarification' : 'kentu-btn--sm'}
                        onClick={() => {
                          if (isClarification) {
                            setConsumedClarificationKeys((prev) => {
                              const next = new Set(prev);
                              next.add(clarificationKey);
                              return next;
                            });
                          }
                          if (isFoodPhotoQuickReply(replyLabel) || replyObj?.action === 'photo' || msg.requestFoodPhoto) {
                            if (isFoodPhotoQuickReply(replyLabel) || replyObj?.action === 'photo') {
                              openFoodPhotoCapture();
                              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                              return;
                            }
                          }
                          if (msg.workoutTimeConfirm) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              workoutTimeReply: rIdx === 0 ? 'accept' : 'reject',
                            });
                          } else if (msg.eveningBriefing && (rIdx === 0 || rIdx === 1)) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              eveningBriefingReply: {
                                action: rIdx === 0 ? 'yes' : 'no',
                                missingKcal: msg.eveningBriefing.missingKcal,
                                missingPro: msg.eveningBriefing.missingPro,
                              },
                            });
                          } else if (msg.morningBriefing?.status && morningActivityIds[rIdx]) {
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              morningBriefingReply: {
                                status: msg.morningBriefing.status,
                                activity: morningActivityIds[rIdx],
                              },
                            });
                          } else {
                            const wizardSelection = replyObj && (replyObj.foodDbKey || replyObj.foodName)
                              ? {
                                  foodDbKey: replyObj.foodDbKey ?? null,
                                  foodName: replyObj.foodName || null,
                                  grams: replyObj.grams ?? null,
                                  action: replyObj.action || null,
                                }
                              : null;
                            onSendMessage(replyLabel, {
                              fromQuickReply: true,
                              clarificationReply: isClarification,
                              wizardSelection,
                              intent: replyObj?.intent || replyObj?.action || undefined,
                              mealType: replyObj?.mealType || replyObj?.mealTypeHint || undefined,
                              mealTypeHint: replyObj?.mealTypeHint || replyObj?.mealType || undefined,
                              skipUserBubble: [
                                'FREE_MEAL_LISTEN',
                                'START_MCDRIVE_WIZARD',
                                'SET_MCDRIVE_MEAL_TYPE',
                                'FINISH_MCDRIVE_WIZARD',
                                'SAVE_MCDRIVE_MEAL',
                                'ADD_MORE_MCDRIVE',
                                'CANCEL_MCDRIVE_WIZARD',
                                'ASK_DAY_REVIEW',
                              ].includes(String(replyObj?.intent || replyObj?.action || '').toUpperCase()),
                            });
                          }
                          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                        }}
                      >
                        {replyLabel}
                      </KentuButton>
                    );
                  })}
                </div>
                );
              })()}
              {msg.dinnerOptions && msg.dinnerOptions.length > 0 && !msg.isTyping && typeof onLogDinnerOption === 'function' && (
                <div className="kentu-quick-row" style={{ justifyContent: 'flex-end' }}>
                  {msg.dinnerOptions.map((opt, oIdx) => (
                    <KentuButton
                      key={oIdx}
                      variant="secondary"
                      className="kentu-btn--sm"
                      onClick={() => {
                        onLogDinnerOption(opt);
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                      }}
                    >
                      Log pasto {oIdx + 1}
                    </KentuButton>
                  ))}
                </div>
              )}
              {msg.agendaOptions && msg.agendaOptions.length > 0 && !msg.isTyping && typeof onLoadAgenda === 'function' && (
                <div className="kentu-quick-row" style={{ justifyContent: 'flex-start' }}>
                  <KentuButton
                    variant="secondary"
                    onClick={() => {
                      onLoadAgenda(msg.agendaOptions);
                      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                  >
                    Carica nel diario
                  </KentuButton>
                </div>
              )}
            </div>
          );
          })}
          {showTypingIndicator ? (
            <TypingIndicator
              avatarSrc={typingAvatarPosterSrc}
              avatarVideoSrc={null}
              hideAvatar={Boolean(hoistedVideo)}
              label={typingIndicatorLabel}
            />
          ) : null}
          <div ref={chatEndRef} />
        </div>
        ) : null}

        {dockedMcDriveTray ? (
          <div
            className={
              isAiGuidedImmersive || hoistedVideo
                ? 'kentu-mcdrive-dock kentu-mcdrive-dock--immersive flex min-h-0 w-full flex-1 flex-col border-t border-zinc-800/80 bg-zinc-950/95 px-2 pt-2'
                : 'kentu-mcdrive-dock flex max-h-[55vh] min-h-0 w-full shrink-0 flex-col border-t border-zinc-800/80 bg-zinc-950/95 px-2 pt-2'
            }
            style={isAiGuidedImmersive || hoistedVideo ? undefined : { paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
            role="region"
            aria-label="Lavagna McDrive"
          >
            <LiveMealTray
              tray={dockedMcDriveTray}
              active
              immersive={isAiGuidedImmersive}
              disabled={isProcessing}
              personalDb={foodDatabase}
              kentuItDb={kentuItDatabase}
              globalDb={globalFoodDatabase}
              getMealTargets={getMcDriveMealTargets}
              onRemoveItem={onMcDriveRemoveItem}
              onUpdateGrams={onMcDriveUpdateGrams}
              onUpdateMealTime={onMcDriveUpdateMealTime}
              onApplyAlternative={onMcDriveApplyAlternative}
              onReplaceFromSearch={onMcDriveReplaceFromSearch}
              onCancel={() => {
                onSendMessage?.('', {
                  intent: 'CANCEL_MCDRIVE_WIZARD',
                  skipUserBubble: true,
                  fromQuickReply: true,
                });
              }}
              onFinish={() => {
                onSendMessage?.('', {
                  intent: 'FINISH_MCDRIVE_WIZARD',
                  skipUserBubble: true,
                  fromQuickReply: true,
                });
              }}
              onSave={() => {
                onSendMessage?.('', {
                  intent: 'SAVE_MCDRIVE_MEAL',
                  skipUserBubble: true,
                  fromQuickReply: true,
                });
              }}
              onAddMore={() => {
                onSendMessage?.('', {
                  intent: 'ADD_MORE_MCDRIVE',
                  skipUserBubble: true,
                  fromQuickReply: true,
                });
              }}
            />
          </div>
        ) : null}

        <div
          className={[
            'flex shrink-0 flex-col overflow-hidden origin-bottom',
            'transition-[max-height,opacity] duration-500 ease-in-out',
            hoistedVideo
              ? 'pointer-events-none max-h-0 opacity-0'
              : 'max-h-[32rem] opacity-100',
          ].join(' ')}
          aria-hidden={hoistedVideo ? true : undefined}
        >
        {chatImages.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, marginLeft: 4, overflowX: 'auto' }}>
            {chatImages.map((imgSrc, index) => (
              <div key={index} style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
                <img src={imgSrc} alt="" style={{ height: 60, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)' }} />
                <KentuButton
                  variant="secondary"
                  className="kentu-btn--icon"
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    width: 26,
                    height: 26,
                    minWidth: 26,
                    padding: 0,
                    borderRadius: '50%',
                    borderColor: 'rgba(248,113,113,0.35)',
                    color: '#fca5a5',
                  }}
                  onClick={() => setChatImages((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="Rimuovi immagine"
                >
                  <KentuIcon name="x" size={14} />
                </KentuButton>
              </div>
            ))}
          </div>
        )}
        {visibleQuickReplies.length > 0 && !suppressQuickReplies && !dockedMcDriveTray ? (
          <div className="flex w-full flex-row gap-2 overflow-x-auto px-2 pb-2 scrollbar-hide">
            {visibleQuickReplies.map((entry) => (
              <button
                key={entry.label}
                type="button"
                onClick={() => {
                  if (isFoodPhotoQuickReply(entry.label) || entry.action === 'photo') {
                    openFoodPhotoCapture();
                  } else {
                    const wizardSelection = (entry.foodDbKey || entry.foodName)
                      ? {
                          foodDbKey: entry.foodDbKey,
                          foodName: entry.foodName,
                          grams: entry.grams,
                          action: entry.action,
                        }
                      : null;
                    onSlotQuickReplyClick?.(entry.label, {
                      wizardSelection,
                      predictiveIntent: entry.intent || entry.action || null,
                      intent: entry.intent || entry.action || null,
                      label: entry.label,
                    });
                  }
                  setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                }}
                className="shrink-0 rounded-full border border-cyan-500/30 bg-slate-900/70 px-3.5 py-1.5 text-sm font-medium text-cyan-200 transition-colors hover:border-cyan-400/50 hover:bg-slate-800/90 hover:text-cyan-50"
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}
        {mealBuilder?.active ? (
          <div
            className="mx-2 mb-2 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-900/30"
            role="status"
            aria-live="polite"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-100">
              {`🍳 Costruzione ${mealBuilder.mealType || 'Pasto'}: ${Array.isArray(mealBuilder.foods) ? mealBuilder.foods.length : 0} alimenti`}
            </span>
            <button
              type="button"
              className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
              aria-label="Annulla costruzione pasto"
              onClick={() => cancelMealBuilder?.()}
            >
              ❌
            </button>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-500"
              onClick={() => commitMealBuilder?.()}
            >
              ✅ Salva Pasto
            </button>
          </div>
        ) : null}
        {!isNotesMode ? (
          <PulsantieraUniversale
            disabled={isProcessing}
            isAiGuidedModeActive={Boolean(dockedMcDriveTray)}
            onOpenManualView={handlePulsantieraOpenManual}
            onOpenActivityView={handlePulsantieraOpenActivity}
            onOpenPlanView={handlePulsantieraOpenPlan}
            onManualShortcut={onManualShortcut}
            onSendChatMessage={handlePulsantieraSend}
            dailyLog={dailyLog}
            isDiabetesAppMode={isDiabetesAppMode}
          />
        ) : null}
        {isVoiceNoteActive ? (
          <div className="kentu-voice-vetrina" role="region" aria-label="Nota vocale">
            <div className="kentu-voice-vetrina__status">
              <span
                className={`kentu-voice-vetrina__dot${voiceNoteStatus === 'recording' ? ' kentu-voice-vetrina__dot--live' : ''}`}
                aria-hidden
              />
              <span className="kentu-voice-vetrina__status-text">
                {voiceNoteStatus === 'recording'
                  ? 'Registrazione in corso'
                  : 'Nota vocale pronta'}
              </span>
            </div>
            <div className="kentu-voice-vetrina__glass kentu-voice-vetrina__glass--note" aria-live="polite">
              {voiceNoteStatus === 'recording' ? (
                <div className="kentu-voice-vetrina__recording-row">
                  <span className="kentu-voice-vetrina__timer" aria-label={`Durata ${voiceNoteDuration}`}>
                    {voiceNoteDuration}
                  </span>
                  <button
                    type="button"
                    className="kentu-voice-vetrina__stop-btn"
                    aria-label="Ferma registrazione"
                    disabled={isProcessing}
                    onClick={() => {
                      clearVoiceError();
                      stopRecording();
                    }}
                  >
                    <span className="kentu-voice-vetrina__stop-icon" aria-hidden />
                  </button>
                </div>
              ) : (
                <div className="kentu-voice-vetrina__pending-row">
                  <span className="kentu-voice-vetrina__timer" aria-label={`Durata ${voiceNoteDuration}`}>
                    {voiceNoteDuration}
                  </span>
                  <span className="kentu-voice-vetrina__pending-label">Nota vocale registrata</span>
                </div>
              )}
              {voiceError ? (
                <p className="kentu-voice-vetrina__error" role="alert">{voiceError}</p>
              ) : null}
            </div>
            {voiceNoteStatus === 'pendingBlob' ? (
              <div className="kentu-voice-vetrina__actions kentu-voice-vetrina__actions--row">
                <button
                  type="button"
                  className="kentu-voice-vetrina__icon-btn kentu-voice-vetrina__icon-btn--danger"
                  aria-label="Elimina nota vocale"
                  disabled={isProcessing || isTranscribingVoiceNote}
                  onClick={() => {
                    clearVoiceError();
                    discardNote();
                  }}
                >
                  🗑️
                </button>
                <button
                  type="button"
                  className={`kentu-voice-vetrina__btn kentu-voice-vetrina__btn--primary kentu-voice-vetrina__btn--send${isTranscribingVoiceNote ? ' kentu-voice-vetrina__btn--loading' : ''}`}
                  disabled={!voiceNoteBlob || isProcessing || isTranscribingVoiceNote}
                  aria-busy={isTranscribingVoiceNote}
                  onClick={() => {
                    void handleSendVoiceNote();
                  }}
                >
                  {isTranscribingVoiceNote ? (
                    <>
                      <span className="kentu-voice-vetrina__spinner" aria-hidden />
                      Trascrizione…
                    </>
                  ) : (
                    'Invia nota vocale'
                  )}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
        <div className={`kentu-input-strip${isNotesMode ? ' kentu-input-strip--notes' : ''}`}>
          <input
            type="file"
            accept="image/*"
            multiple
            ref={chatFileInputRef}
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                Promise.all(
                  files.map(
                    (file) =>
                      new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(file);
                      })
                  )
                ).then((newBase64Images) => {
                  setChatImages((prev) => [...prev, ...newBase64Images]);
                });
                e.target.value = '';
              }
            }}
          />
          <ChatInputBar
            seedText={chatInput}
            onSeedConsumed={handleSeedConsumed}
            placeholder={chatInputPlaceholder}
            disabled={isProcessing && !isNotesMode}
            isProcessing={isProcessing}
            isNotesMode={isNotesMode}
            canSendWithImages={!isNotesMode && Array.isArray(chatImages) && chatImages.length > 0}
            onSubmit={handleComposerSubmit}
            onCancelGeneration={onCancelGeneration}
            tools={(
              <>
                <KentuButton variant="ghost" className="kentu-btn--icon" type="button" onClick={() => chatFileInputRef.current?.click()} aria-label="Allega immagine">
                  <KentuIcon name="camera" size={22} />
                </KentuButton>
                {voiceNoteSupported ? (
                  <button
                    type="button"
                    className="kentu-btn--icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-transparent text-[16px] text-zinc-300 transition hover:border-cyan-500/40 hover:text-cyan-200"
                    aria-label="Registra nota vocale"
                    disabled={isProcessing && !isNotesMode}
                    onClick={() => {
                      clearVoiceError();
                      startRecording();
                    }}
                    title="Registra una nota vocale"
                  >
                    🎤
                  </button>
                ) : null}
                <div className="kentu-devtools-wrap" ref={toolsMenuRef}>
                  <button
                    type="button"
                    className={`kentu-devtools-btn${isNotesMode ? ' kentu-devtools-btn--notes' : ''}`}
                    aria-label={isNotesMode ? 'Disattiva modalità note' : 'Tools'}
                    aria-expanded={showToolsMenu}
                    onClick={handleToolsButtonClick}
                  >
                    {isNotesMode ? '📝' : '🛠️'}
                  </button>
                  {showToolsMenu ? (
                    <div className="kentu-devtools-menu" role="menu">
                      <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleRequestReportFromTools}>
                        🧠 Analisi Oggi
                      </button>
                      <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleBarcodeTool}>
                        📷 Scanner Barcode
                      </button>
                      <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleActivateNotesMode}>
                        📝 Modalità Note
                      </button>
                      <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleSaveChat}>
                        💬 Salva Chat
                      </button>
                      <button type="button" role="menuitem" className="kentu-devtools-menu__item" onClick={handleFlagAnomaly}>
                        ⚠️ Segnala Anomalia
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          />
          {devToolsToast ? (
            <div className="kentu-devtools-toast" role="status" aria-live="polite">
              {devToolsToast}
            </div>
          ) : null}
        </div>
        )}
        {voiceError ? (
          <p
            role="alert"
            className="px-3 pb-2 text-[11px] text-rose-300/90"
            onClick={clearVoiceError}
          >
            {voiceError}
          </p>
        ) : null}
        </div>
      </div>
    </div>
  );
}
