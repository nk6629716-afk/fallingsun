import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserProfile,
  PersonnelProfile,
  VitalSignRecord,
  VitalWatchSummary,
  UserRole,
} from '@shared/types';
import { vitalWatchApi } from '../../services/api/vitalWatchApi';
import {
  HeartPulse,
  Activity,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  LogIn,
  LogOut,
  MapPin,
  Clock,
  Compass,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Users,
  Navigation,
  FileText,
  Thermometer,
  Wind,
  RefreshCw,
  Send,
} from 'lucide-react';

export const VitalWatchModule: React.FC<{ currentUser: UserProfile }> = ({ currentUser }) => {
  const canApprove = currentUser.role === 'admin' || currentUser.role === 'administrator';
  // State
  const [personnelList, setPersonnelList] = useState<PersonnelProfile[]>([]);
  const [vitalsList, setVitalsList] = useState<VitalSignRecord[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [summary, setSummary] = useState<VitalWatchSummary | null>(null);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('PERS-001');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modals & Sub-views
  const [showAssignmentModal, setShowAssignmentModal] = useState<boolean>(false);

  // GPS state
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'acquired' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Vitals form
  const [vitalsForm, setVitalsForm] = useState({
    heartRate: '72',
    spo2: '98',
    systolicBp: '120',
    diastolicBp: '80',
    temperature: '36.8',
    respiratoryRate: '14',
    notes: '',
  });

  // Assignment form
  const [assignmentForm, setAssignmentForm] = useState({
    teamName: '',
    missionName: '',
  });

  // Load all data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [persRes, vitRes, usersRes, sumRes] = await Promise.all([
        vitalWatchApi.getPersonnel(),
        vitalWatchApi.getVitals(),
        canApprove ? vitalWatchApi.getUsers() : Promise.resolve({ users: [] }),
        vitalWatchApi.getSummary(),
      ]);
      setPersonnelList(persRes.personnel);
      setVitalsList(vitRes.vitals);
      setUsersList(usersRes.users);
      setSummary(sumRes.summary);
    } catch (err: any) {
      console.error('Failed to load VitalWatch data:', err);
      setFeedbackMessage({ type: 'error', text: err.message || 'Error loading records' });
    } finally {
      setIsLoading(false);
    }
  }, [canApprove]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedPerson = useMemo(() => {
    return personnelList.find((p) => p.id === selectedPersonnelId) || personnelList[0] || null;
  }, [personnelList, selectedPersonnelId]);

  const selectedPersonVitals = useMemo(() => {
    if (!selectedPerson) return [];
    return vitalsList.filter((v) => v.personnelId === selectedPerson.id);
  }, [vitalsList, selectedPerson]);

  const pendingUsers = useMemo(() => {
    return usersList.filter((u) => u.status === 'pending');
  }, [usersList]);

  // Handle Admin Approval
  const handleApprove = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await vitalWatchApi.approveUser(userId, currentUser.id, status);
      setFeedbackMessage({
        type: 'success',
        text: `User ${res.user.name} was ${status.toUpperCase()}.`,
      });
      fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Approval failed' });
    }
  };

  // Handle Manual Vitals Submission
  const handleRecordVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson) return;

    if (!['medic', 'admin', 'medical_officer', 'administrator'].includes(currentUser.role)) {
      setFeedbackMessage({
        type: 'error',
        text: 'Access Denied: Only authorized medical personnel (medic or admin) may record vitals.',
      });
      return;
    }

    try {
      const res = await vitalWatchApi.recordVitals({
        personnelId: selectedPerson.id,
        personnelName: selectedPerson.name,
        heartRate: Number(vitalsForm.heartRate),
        spo2: Number(vitalsForm.spo2),
        systolicBp: Number(vitalsForm.systolicBp),
        diastolicBp: Number(vitalsForm.diastolicBp),
        temperature: Number(vitalsForm.temperature),
        respiratoryRate: Number(vitalsForm.respiratoryRate),
        recordedBy: currentUser.name,
        recorderRole: currentUser.role,
        notes: vitalsForm.notes,
      });

      setFeedbackMessage({
        type: 'success',
        text: `Manual vitals recorded for ${selectedPerson.name} by ${currentUser.name}.`,
      });
      setVitalsForm((prev) => ({ ...prev, notes: '' }));
      fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to record vitals' });
    }
  };

  // Handle Browser GPS Acquisition (Explicit user action required)
  const handleAcquireBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Geolocation API is not supported by your browser environment.');
      return;
    }

    if (!selectedPerson) return;

    setGpsStatus('requesting');
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = parseFloat(pos.coords.latitude.toFixed(6));
          const lng = parseFloat(pos.coords.longitude.toFixed(6));
          const accuracy = Math.round(pos.coords.accuracy);

          await vitalWatchApi.updateLocation({
            personnelId: selectedPerson.id,
            lat,
            lng,
            accuracyMeters: accuracy,
            source: 'browser_gps',
          });

          setGpsStatus('acquired');
          setFeedbackMessage({
            type: 'success',
            text: `GPS lock acquired: ${lat}, ${lng} (±${accuracy}m accuracy). Location history updated.`,
          });
          fetchData();
        } catch (err: any) {
          setGpsStatus('error');
          setGpsError(err.message || 'Failed to record GPS coordinates to server.');
        }
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(`Permission or signal denied: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Handle Mission / Team Assignment
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPerson) return;

    try {
      await vitalWatchApi.updatePersonnel({
        id: selectedPerson.id,
        name: selectedPerson.name,
        teamName: assignmentForm.teamName || selectedPerson.teamName,
        missionName: assignmentForm.missionName || selectedPerson.missionName,
      });

      setFeedbackMessage({
        type: 'success',
        text: `Updated assignment for ${selectedPerson.name}.`,
      });
      setShowAssignmentModal(false);
      fetchData();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to update assignment' });
    }
  };

  // Determine Staleness badge
  const renderStalenessBadge = (isStale?: boolean, lastSeenAt?: string) => {
    if (!lastSeenAt) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-600 border border-gray-300">
          <Clock className="w-3 h-3 text-gray-400" /> UNKNOWN
        </span>
      );
    }
    if (isStale) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-amber-50 text-amber-700 border border-amber-300">
          <AlertTriangle className="w-3 h-3 text-amber-500" /> STALE (&gt;15m)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3 text-emerald-500" /> ACTIVE
      </span>
    );
  };

  const isCurrentPending = currentUser.status === 'pending';
  const isMedicOrAdmin = ['medic', 'admin', 'medical_officer', 'administrator'].includes(currentUser.role);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#F4F1EA] text-[#1E252B] p-4 lg:p-6 space-y-6">
      {/* -------------------------------------------------------------------- */}
      {/* 1. TOP HEADER & AUTHENTICATION BAR */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 backdrop-blur border border-[#D9D3C7] rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#2E4A7D] flex items-center justify-center text-white shadow-inner">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#1E252B]">VITALWATCH</h1>
              <span className="px-2 py-0.5 text-xs font-mono uppercase bg-[#2E4A7D]/10 text-[#2E4A7D] rounded border border-[#2E4A7D]/20">
                TACTICAL VITALS & GPS
              </span>
              <span className="px-2 py-0.5 text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded">
                MVP SPRINT
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Personnel health telemetry, manual medical verification, and permission-based GPS positioning
            </p>
          </div>
        </div>

        {/* Current User Session Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EFECE6] border border-[#D9D3C7]">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <div className="text-xs">
              <span className="font-semibold text-gray-800">{currentUser.name}</span>
              <span className="text-gray-500 ml-1">({currentUser.role.toUpperCase()})</span>
            </div>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                currentUser.status === 'approved'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {currentUser.status}
            </span>
          </div>

          <button
            onClick={fetchData}
            title="Refresh Data"
            className="p-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-600 border border-[#D9D3C7] shadow-sm transition"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback Alert Notification */}
      {feedbackMessage && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center justify-between transition-all ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedbackMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {feedbackMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600" />}
            {feedbackMessage.type === 'info' && <ShieldAlert className="w-4 h-4 text-blue-600" />}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-bold opacity-60 hover:opacity-100 px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 2. PRIORITY 1: PENDING ACCOUNT BLOCKER BANNER */}
      {/* -------------------------------------------------------------------- */}
      {isCurrentPending && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 shadow-sm text-amber-900">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-7 h-7 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-bold tracking-tight uppercase">
                Account Pending Administrator Approval
              </h2>
              <p className="text-sm mt-1 text-amber-800 leading-relaxed">
                Your account (<span className="font-semibold">{currentUser.email}</span>) was registered successfully and is currently marked as <span className="font-mono font-bold bg-amber-200 px-1 py-0.5 rounded text-xs">PENDING</span>. In accordance with Sentinel operational doctrine, pending users are strictly restricted from accessing live mission telemetries, patient vitals history, and operational tactical mapping.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-700">
                <ShieldCheck className="w-4 h-4" />
                <span>To approve this account, switch to an Administrator profile above or ask your tactical command officer.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3. PRIORITY 1: ADMIN APPROVAL DRAWER (VISIBLE TO ADMINS) */}
      {/* -------------------------------------------------------------------- */}
      {canApprove && pendingUsers.length > 0 && (
        <div className="bg-white border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="text-sm font-bold tracking-wide uppercase text-gray-800">
                Administrator Approval Console ({pendingUsers.length} Pending Applicants)
              </h2>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono font-semibold bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
              ROLE PRIVILEGE VERIFIED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingUsers.map((applicant) => (
              <div
                key={applicant.id}
                className="p-3.5 rounded-lg bg-[#FAF9F6] border border-[#E0DBCF] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-sm text-[#1E252B]">{applicant.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{applicant.email}</div>
                    </div>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono uppercase bg-amber-100 text-amber-800 rounded font-semibold">
                      {applicant.role}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600 space-y-0.5">
                    <div>Team: <span className="font-medium text-gray-800">{applicant.teamName || 'Unassigned'}</span></div>
                    <div>Mission: <span className="font-medium text-gray-800">{applicant.missionName || 'Operation Falling Sun'}</span></div>
                    <div className="text-[11px] text-gray-400">Registered: {new Date(applicant.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-gray-200/60 flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(applicant.id, 'approved')}
                    className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center justify-center gap-1 shadow-sm transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleApprove(applicant.id, 'rejected')}
                    className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium flex items-center justify-center gap-1 transition"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* If current user is pending, hide the operational tactical panels */}
      {!isCurrentPending && (
        <>
          {/* Summary KPIs */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Personnel Tracked</div>
                <div className="text-xl font-bold text-[#1E252B] mt-0.5">{summary.totalPersonnel}</div>
              </div>
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Active GPS Locks</div>
                <div className="text-xl font-bold text-emerald-600 mt-0.5">{summary.activeLocationsCount}</div>
              </div>
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Stale Signals</div>
                <div className="text-xl font-bold text-amber-600 mt-0.5">{summary.staleLocationsCount}</div>
              </div>
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Manual Vitals</div>
                <div className="text-xl font-bold text-[#2E4A7D] mt-0.5">{summary.recentVitalsCount}</div>
              </div>
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Approved Users</div>
                <div className="text-xl font-bold text-gray-800 mt-0.5">{summary.approvedUsers}</div>
              </div>
              <div className="bg-white/90 border border-[#D9D3C7] rounded-xl p-3 shadow-sm">
                <div className="text-[11px] font-mono text-gray-500 uppercase">Pending Approvals</div>
                <div className="text-xl font-bold text-amber-700 mt-0.5">{summary.pendingUsers}</div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* MAIN 2-COLUMN OPERATIONAL GRID */}
          {/* ------------------------------------------------------------------ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN: Personnel List & Manual Vitals Entry (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Personnel Roster & Assignment */}
              <div className="bg-white border border-[#D9D3C7] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#2E4A7D]" />
                    <h2 className="text-sm font-bold tracking-wide uppercase text-gray-800">
                      Personnel Profiles & Tactical Assignment
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      if (selectedPerson) {
                        setAssignmentForm({
                          teamName: selectedPerson.teamName || '',
                          missionName: selectedPerson.missionName || '',
                        });
                        setShowAssignmentModal(true);
                      }
                    }}
                    className="text-xs font-semibold text-[#2E4A7D] hover:underline flex items-center gap-1"
                  >
                    Edit Assignment
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {personnelList.map((person) => {
                    const isSelected = person.id === selectedPerson?.id;
                    return (
                      <div
                        key={person.id}
                        onClick={() => setSelectedPersonnelId(person.id)}
                        className={`cursor-pointer p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? 'bg-[#2E4A7D]/10 border-[#2E4A7D] shadow-sm'
                            : 'bg-[#FAF9F6] border-[#E0DBCF] hover:border-gray-400'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-gray-500">{person.id}</span>
                          {renderStalenessBadge(person.isStale, person.lastSeenAt)}
                        </div>
                        <div className="font-bold text-sm text-[#1E252B] mt-1 truncate">{person.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{person.callsign || 'NO_CALLSIGN'}</div>
                        <div className="mt-2 text-[11px] text-gray-600 border-t border-gray-200/60 pt-1.5">
                          <div className="truncate font-medium text-gray-800">{person.teamName}</div>
                          <div className="truncate text-gray-500">{person.missionName}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Priority 2: Manual Vitals Form */}
              <div className="bg-white border border-[#D9D3C7] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-rose-600" />
                    <div>
                      <h2 className="text-sm font-bold tracking-wide uppercase text-gray-800">
                        Manual Vitals Entry — {selectedPerson ? selectedPerson.name : 'Select Personnel'}
                      </h2>
                      <span className="text-[11px] text-gray-500 font-mono">
                        RECORDER IDENTITY: {currentUser.name} ({currentUser.role.toUpperCase()})
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                    MANUAL MEASUREMENT ONLY
                  </span>
                </div>

                {!isMedicOrAdmin ? (
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Medical Authorization Required:</span> You are currently logged in with role <span className="font-mono uppercase font-bold">{currentUser.role}</span>. In compliance with clinical protocols, only authorized medical officers (Role: <span className="font-semibold">medic</span> or <span className="font-semibold">admin</span>) may write manual vital sign records.
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleRecordVitals} className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {/* Heart Rate */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          Heart Rate (bpm)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="30"
                            max="250"
                            value={vitalsForm.heartRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, heartRate: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                            required
                          />
                          <span className="absolute right-3 top-2 text-xs text-gray-400 font-mono">BPM</span>
                        </div>
                      </div>

                      {/* SpO2 */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          Oxygen SpO2 (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="50"
                            max="100"
                            value={vitalsForm.spo2}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                            required
                          />
                          <span className="absolute right-3 top-2 text-xs text-gray-400 font-mono">%</span>
                        </div>
                      </div>

                      {/* Respiratory Rate */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          Resp Rate (rpm)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="4"
                            max="60"
                            value={vitalsForm.respiratoryRate}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, respiratoryRate: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                            required
                          />
                          <span className="absolute right-3 top-2 text-xs text-gray-400 font-mono">RPM</span>
                        </div>
                      </div>

                      {/* Blood Pressure Systolic */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          BP Systolic (mmHg)
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="260"
                          value={vitalsForm.systolicBp}
                          onChange={(e) => setVitalsForm({ ...vitalsForm, systolicBp: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                          required
                        />
                      </div>

                      {/* Blood Pressure Diastolic */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          BP Diastolic (mmHg)
                        </label>
                        <input
                          type="number"
                          min="30"
                          max="160"
                          value={vitalsForm.diastolicBp}
                          onChange={(e) => setVitalsForm({ ...vitalsForm, diastolicBp: e.target.value })}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                          required
                        />
                      </div>

                      {/* Temperature */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                          Temperature (°C)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min="30.0"
                            max="45.0"
                            value={vitalsForm.temperature}
                            onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })}
                            className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] font-mono focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                            required
                          />
                          <span className="absolute right-3 top-2 text-xs text-gray-400 font-mono">°C</span>
                        </div>
                      </div>
                    </div>

                    {/* Clinical Notes */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase font-mono mb-1">
                        Clinical Observation Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Patient conscious, normotensive, slight exertion post-patrol."
                        value={vitalsForm.notes}
                        onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[#D9D3C7] bg-[#FAF9F6] focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="text-xs text-gray-500 font-mono">
                        All readings are stamped with timestamp, device source, and reviewer credentials.
                      </div>
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2E4A7D] hover:bg-[#253D68] text-white text-xs font-semibold shadow-sm transition"
                      >
                        <Send className="w-3.5 h-3.5" /> Save Manual Vitals
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Vitals History Log */}
              <div className="bg-white border border-[#D9D3C7] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <h3 className="text-xs font-bold tracking-wide uppercase text-gray-700">
                      Historical Vitals Feed ({selectedPerson ? selectedPerson.name : 'All'})
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-gray-400">
                    {selectedPersonVitals.length} records verified
                  </span>
                </div>

                {selectedPersonVitals.length === 0 ? (
                  <div className="text-center py-6 text-xs text-gray-400 font-mono">
                    No vitals recordings found for this personnel.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {selectedPersonVitals.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E0DBCF] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1E252B]">
                              HR: {rec.heartRate} bpm | SpO2: {rec.spo2}% | BP: {rec.systolicBp}/{rec.diastolicBp} | Temp: {rec.temperature}°C | RR: {rec.respiratoryRate}
                            </span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              MANUAL
                            </span>
                          </div>
                          {rec.notes && <div className="text-xs text-gray-600 mt-1 italic">&ldquo;{rec.notes}&rdquo;</div>}
                          <div className="text-[11px] text-gray-400 font-mono mt-1">
                            Recorded by: <span className="font-semibold text-gray-700">{rec.recordedBy}</span> ({rec.recorderRole}) • {new Date(rec.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Priority 3 - Tactical Personnel Map & Browser GPS (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white border border-[#D9D3C7] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
                  <div className="flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-[#2E4A7D]" />
                    <h2 className="text-sm font-bold tracking-wide uppercase text-gray-800">
                      Tactical Personnel Map & GPS
                    </h2>
                  </div>
                  {selectedPerson && renderStalenessBadge(selectedPerson.isStale, selectedPerson.lastSeenAt)}
                </div>

                {/* Explicit Browser GPS Action Button */}
                <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E0DBCF] mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-gray-800">Permission-Based Browser GPS</div>
                      <div className="text-[11px] text-gray-500">
                        Explicit permission required. Browser does not track background locations without trigger.
                      </div>
                    </div>
                    <button
                      onClick={handleAcquireBrowserGps}
                      disabled={gpsStatus === 'requesting'}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {gpsStatus === 'requesting' ? 'Acquiring...' : 'Acquire GPS'}
                    </button>
                  </div>

                  {gpsError && (
                    <div className="mt-2 text-xs text-rose-600 flex items-center gap-1 font-mono">
                      <AlertTriangle className="w-3.5 h-3.5" /> {gpsError}
                    </div>
                  )}
                </div>

                {/* Tactical SVG Map Canvas */}
                <div className="relative w-full h-72 bg-[#1A2332] rounded-lg border border-[#2E3B50] overflow-hidden flex flex-col justify-between p-3 select-none">
                  {/* Grid Lines Overlay */}
                  <div
                    className="absolute inset-0 opacity-15 pointer-events-none"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, #4A5D7A 1px, transparent 1px), linear-gradient(to bottom, #4A5D7A 1px, transparent 1px)',
                      backgroundSize: '30px 30px',
                    }}
                  />

                  {/* Top HUD overlay */}
                  <div className="relative z-10 flex items-center justify-between text-[11px] font-mono text-cyan-400">
                    <span>SECTOR: 34.05N, -118.24W (CCP DELTA)</span>
                    <span className="flex items-center gap-1">
                      <Compass className="w-3 h-3" /> BEARING: 042°
                    </span>
                  </div>

                  {/* Map Coordinate Markers & Trail */}
                  <div className="relative z-10 flex-1 flex items-center justify-center">
                    <svg className="w-full h-full" viewBox="0 0 300 160">
                      {/* Grid circles */}
                      <circle cx="150" cy="80" r="60" fill="none" stroke="#2A3B52" strokeWidth="1" strokeDasharray="3 3" />
                      <circle cx="150" cy="80" r="30" fill="none" stroke="#2A3B52" strokeWidth="1" />

                      {/* Location history breadcrumbs */}
                      {selectedPerson?.locationHistory && selectedPerson.locationHistory.length > 1 && (
                        <polyline
                          points={selectedPerson.locationHistory
                            .map((pt, idx) => {
                              const x = 70 + idx * 45;
                              const y = 110 - idx * 25;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                          fill="none"
                          stroke="#38BDF8"
                          strokeWidth="2"
                          strokeDasharray="4 2"
                        />
                      )}

                      {/* Personnel Markers */}
                      {personnelList.map((person, i) => {
                        const isTarget = person.id === selectedPerson?.id;
                        const x = 80 + i * 50;
                        const y = 90 - i * 15;
                        const markerColor = person.isStale ? '#F59E0B' : '#10B981';

                        return (
                          <g
                            key={person.id}
                            className="cursor-pointer"
                            onClick={() => setSelectedPersonnelId(person.id)}
                          >
                            {isTarget && (
                              <circle cx={x} cy={y} r="12" fill="none" stroke="#38BDF8" strokeWidth="1.5">
                                <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" repeatCount="indefinite" />
                              </circle>
                            )}
                            <circle cx={x} cy={y} r="5" fill={markerColor} />
                            <text
                              x={x}
                              y={y - 8}
                              fontSize="8"
                              fill="#E2E8F0"
                              textAnchor="middle"
                              fontFamily="monospace"
                            >
                              {person.callsign || person.name.split(' ')[0]}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Bottom Map Status Bar */}
                  <div className="relative z-10 flex items-center justify-between text-[10px] font-mono text-gray-400 bg-[#141C28]/80 p-1.5 rounded border border-[#2A374A]">
                    <div>
                      CURRENT: <span className="text-white font-bold">{selectedPerson?.name}</span>
                    </div>
                    <div>
                      {selectedPerson?.currentLocation ? (
                        <span>
                          LAT: {selectedPerson.currentLocation.lat} LNG: {selectedPerson.currentLocation.lng} (±{selectedPerson.currentLocation.accuracyMeters || 5}m)
                        </span>
                      ) : (
                        <span className="text-amber-400">NO FIX RECORDED</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Location Trail & Timestamp details */}
                <div className="mt-4 space-y-2">
                  <div className="text-xs font-bold uppercase text-gray-700 flex items-center justify-between">
                    <span>GPS Fix & Location History</span>
                    <span className="text-gray-400 font-mono text-[11px]">
                      {selectedPerson?.locationHistory?.length || 0} waypoints
                    </span>
                  </div>

                  {selectedPerson?.currentLocation ? (
                    <div className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E0DBCF] text-xs font-mono text-gray-700 space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Latitude:</span>
                        <span className="font-bold">{selectedPerson.currentLocation.lat}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Longitude:</span>
                        <span className="font-bold">{selectedPerson.currentLocation.lng}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Accuracy:</span>
                        <span>±{selectedPerson.currentLocation.accuracyMeters || 5} meters</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Source:</span>
                        <span className="uppercase text-emerald-700 font-bold">{selectedPerson.currentLocation.source}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Last Reported:</span>
                        <span>{new Date(selectedPerson.currentLocation.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-500 text-center font-mono">
                      No coordinates recorded yet. Click &ldquo;Acquire GPS&rdquo; above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 6. TEAM & MISSION ASSIGNMENT MODAL (PRIORITY 1 & 2) */}
      {/* -------------------------------------------------------------------- */}
      {showAssignmentModal && selectedPerson && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-gray-300 shadow-xl max-w-md w-full p-6 text-[#1E252B]">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#2E4A7D]" />
                <h3 className="font-bold text-base">Assign Team & Mission — {selectedPerson.name}</h3>
              </div>
              <button onClick={() => setShowAssignmentModal(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <form onSubmit={handleSaveAssignment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Assigned Team / Unit</label>
                <input
                  type="text"
                  required
                  value={assignmentForm.teamName}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, teamName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-[#FAF9F6] border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Operational Mission</label>
                <input
                  type="text"
                  required
                  value={assignmentForm.missionName}
                  onChange={(e) => setAssignmentForm({ ...assignmentForm, missionName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border rounded-lg bg-[#FAF9F6] border-gray-300 focus:outline-none focus:ring-1 focus:ring-[#2E4A7D]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignmentModal(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#2E4A7D] hover:bg-[#253D68] text-white rounded-lg shadow-sm"
                >
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
