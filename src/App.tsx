/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  format, 
  differenceInMinutes, 
  differenceInSeconds, 
  isAfter,
  subHours
} from 'date-fns';
import * as XLSX from 'xlsx';
import { Toaster, toast } from 'sonner';
import { 
  QrCode, 
  Timer, 
  LogOut, 
  History, 
  AlertCircle, 
  CheckCircle2, 
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OPERATORS, QR_FORMAT_REGEX } from './constants';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AttendanceRecord {
  id: string;
  operatorId: string;
  operatorName: string;
  checkInTime: string | Date;
  checkOutTime: string | Date | null;
  durationMinutes: number | null;
  shift: 1 | 2;
  date: string;
  status: 'IN' | 'OUT';
}

const determineShift = (date: Date): 1 | 2 => {
  const hour = date.getHours();
  if (hour >= 6 && hour < 18) return 1;
  return 2;
};

export default function App() {
  const [view, setView] = useState<'home' | 'scan' | 'active' | 'recap'>('home');
  const [activeSessions, setActiveSessions] = useState<AttendanceRecord[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync data with LocalStorage and apply 24h retention
  useEffect(() => {
    const loadAndCleanup = () => {
      const stored = localStorage.getItem('fitcheck_data_v2');
      if (stored) {
        try {
          const allData: AttendanceRecord[] = JSON.parse(stored);
          const now = new Date();
          const oneDayAgo = subHours(now, 24);

          // Retention logic: only keep records from the last 24 hours
          const recentData = allData.filter(r => {
            const checkInTime = new Date(r.checkInTime as any);
            return isAfter(checkInTime, oneDayAgo);
          });

          const active = recentData.filter(r => r.status === 'IN');
          const completed = recentData.filter(r => r.status === 'OUT');

          setActiveSessions(active);
          setRecords(completed);
          
          // Save cleaned data back to storage
          localStorage.setItem('fitcheck_data_v2', JSON.stringify(recentData));
        } catch (e) {
          console.error('Data corrupted, resetting storage', e);
          localStorage.removeItem('fitcheck_data_v2');
        }
      }
      setLoading(false);
    };

    loadAndCleanup();
  }, []);

  const saveToStorage = (allRecords: AttendanceRecord[]) => {
    localStorage.setItem('fitcheck_data_v2', JSON.stringify(allRecords));
  };

  const handleScanSuccess = async (decodedText: string) => {
    const match = decodedText.match(QR_FORMAT_REGEX);
    if (!match) {
      toast.error('Format QR Code tidak valid');
      return;
    }

    const operatorId = match[1];
    const operatorName = OPERATORS[operatorId];
    if (!operatorName) {
      toast.error(`Operator ID ${operatorId} tidak ditemukan`);
      return;
    }

    const alreadyActive = activeSessions.find(s => s.operatorId === operatorId);
    if (alreadyActive) {
      toast.error(`${operatorName} sudah dalam sesi aktif.`);
      setView('active');
      return;
    }

    const now = new Date();
    const shift = determineShift(now);
    const dateStr = format(now, 'yyyy-MM-dd');

    const newRecord: AttendanceRecord = {
      id: Math.random().toString(36).substr(2, 9),
      operatorId,
      operatorName,
      checkInTime: now,
      checkOutTime: null,
      durationMinutes: null,
      shift,
      date: dateStr,
      status: 'IN'
    };

    const newActiveList = [newRecord, ...activeSessions];
    setActiveSessions(newActiveList);
    
    // Persist all data combined
    const currentStored: AttendanceRecord[] = JSON.parse(localStorage.getItem('fitcheck_data_v2') || '[]');
    saveToStorage([newRecord, ...currentStored]);

    toast.success(`Check-in berhasil: ${operatorName}`);
    setView('active');
  };

  const handleFinishSession = (session: AttendanceRecord) => {
    const now = new Date();
    const checkInTime = new Date(session.checkInTime as any);
    const duration = differenceInMinutes(now, checkInTime);
    
    const updatedRecord: AttendanceRecord = {
      ...session,
      status: 'OUT',
      checkOutTime: now,
      durationMinutes: duration
    };

    // Update state
    setRecords(prev => [updatedRecord, ...prev]);
    setActiveSessions(prev => prev.filter(s => s.id !== session.id));

    // Persist
    const currentStored: AttendanceRecord[] = JSON.parse(localStorage.getItem('fitcheck_data_v2') || '[]');
    const newStored = currentStored.map(r => r.id === session.id ? updatedRecord : r);
    saveToStorage(newStored);

    toast.success(`Check-out berhasil: ${session.operatorName}. Durasi: ${duration} menit.`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 font-sans flex flex-col items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="w-full h-full sm:h-[844px] sm:max-w-[390px] bg-slate-50 rounded-none sm:rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col border-0 sm:border-[8px] border-slate-800">
        <Toaster position="top-center" expand={true} richColors />
        
        {/* Notch - only visible on mobile-simulated desktop */}
        <div className="hidden sm:flex h-6 bg-slate-800 w-32 absolute top-0 left-1/2 -translate-x-1/2 rounded-b-2xl z-50 justify-center items-end pb-1">
          <div className="w-2 h-2 rounded-full bg-slate-700"></div>
        </div>

        {/* Header */}
        <header className="bg-[#2563EB] pt-10 pb-6 px-6 text-white shrink-0">
          <div className="flex justify-between items-center mb-1">
            <div>
              <p className="text-[10px] opacity-80 uppercase tracking-[0.2em] font-bold">Health Check-in</p>
              <h1 className="text-xl font-black tracking-tight">Cek Kebugaran</h1>
              <p className="text-[9px] opacity-70 font-bold uppercase tracking-wider">Say No to Fatigue</p>
            </div>
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md text-right border border-white/10">
              <p className="text-[9px] leading-tight font-black opacity-80">SHIFT {determineShift(new Date())}</p>
              <p className="text-xs font-mono font-bold">{format(new Date(), 'HH:mm')}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative">
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div
                key="home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6"
              >
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group">
                  <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-lg">New Session</span>
                      <Sun className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-800 leading-tight">Ready for health check?</h2>
                      <p className="text-slate-400 text-xs mt-1 font-medium">Scan operator badge to start tracking.</p>
                    </div>
                    <button 
                      onClick={() => setView('scan')}
                      className="mt-2 bg-[#2563EB] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-blue-200 active:scale-95 transition-all w-full"
                    >
                      <QrCode className="w-5 h-5" />
                      Mulai Scan QR
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setView('recap')}
                    className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3 hover:shadow-md transition-all active:scale-95 text-left"
                  >
                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                      <History className="text-slate-600 w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-black block text-slate-800">Recap Report</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">Shift 1 & 2</span>
                    </div>
                  </button>
                  <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-3">
                    <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                      <ShieldCheck className="text-emerald-600 w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-xs font-black block text-slate-800">Compliance</span>
                      <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter mt-0.5">Verified Data</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Quick Guide</h3>
                  <div className="space-y-3">
                    {[
                      { icon: QrCode, text: "Scan QR operator badge", color: "text-blue-600", bg: "bg-blue-50" },
                      { icon: Timer, text: "Wait for fitness evaluation", color: "text-slate-600", bg: "bg-slate-100" },
                      { icon: AlertCircle, text: "Max evaluation time: 8 min", color: "text-orange-600", bg: "bg-orange-50" }
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-100">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", step.bg)}>
                          <step.icon className={cn("w-5 h-5", step.color)} />
                        </div>
                        <p className="text-xs text-slate-600 font-bold">{step.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'scan' && (
              <motion.div
                key="scan"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col gap-6"
              >
                <div className="flex items-center justify-between px-1">
                  <button onClick={() => setView('home')} className="text-[#2563EB] font-black text-[10px] uppercase tracking-widest">Back</button>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">QR Scanner</h3>
                  <div className="w-10"></div>
                </div>
                <div className="relative">
                  <Scanner onResult={handleScanSuccess} />
                </div>
                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
                  <p className="text-[10px] text-orange-800 leading-relaxed font-bold uppercase tracking-tight">
                    Ensure QR Format: (ID) - SPRO - OPRT - ARIA
                  </p>
                </div>
              </motion.div>
            )}

            {view === 'active' && activeSessions.length > 0 && (
              <motion.div
                key="active"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col gap-4">
                  {activeSessions.map((session) => (
                    <div key={session.id} className="bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 font-black px-2 py-1 rounded-lg uppercase tracking-widest">Active Session</span>
                        <span className="text-[10px] text-slate-400 font-mono font-bold">{format(new Date(session.checkInTime as any), 'hh:mm:ss a')}</span>
                      </div>
                      
                      <div className="flex flex-col">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">{session.operatorId} - SPRO - OPRT - ARIA</p>
                        <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none truncate">{session.operatorName}</h3>
                      </div>

                      <div className="h-px bg-slate-50 w-full" />

                      <LiveTimer checkInTime={new Date(session.checkInTime as any)} />

                      <button 
                        onClick={() => handleFinishSession(session)}
                        className="w-full flex items-center justify-center gap-3 bg-blue-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-blue-200 active:scale-95 transition-all text-sm uppercase tracking-widest"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                        Finish Activity
                      </button>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setView('scan')}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                  >
                    <QrCode className="w-4 h-4" />
                    Scan Operator Lain
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'recap' && (
              <motion.div
                key="recap"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col gap-6"
              >
                <div className="flex items-center justify-between px-1">
                  <button onClick={() => setView('home')} className="text-[#2563EB] font-black text-[10px] uppercase tracking-widest">Back</button>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Operational Dashboard</h3>
                  <div className="w-10"></div>
                </div>
                <RecapView records={records} />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer Nav */}
        <nav className="bg-white border-t border-slate-100 px-10 py-5 flex items-center justify-between shadow-[0_-10px_20px_rgba(0,0,0,0.02)] shrink-0">
          <button 
            onClick={() => setView('home')} 
            className={cn(
              "flex flex-col items-center gap-1.5 transition-all duration-300",
              view === 'home' ? "text-[#2563EB] scale-110" : "text-slate-300 hover:text-slate-400"
            )}
          >
            <QrCode className="w-6 h-6" strokeWidth={view === 'home' ? 2.5 : 2} />
            <span className="text-[10px] font-black uppercase tracking-widest">Scan</span>
          </button>
          
          <div className="h-8 w-px bg-slate-100" />

          <button 
            onClick={() => setView('recap')} 
            className={cn(
              "flex flex-col items-center gap-1.5 transition-all duration-300",
              view === 'recap' ? "text-[#2563EB] scale-110" : "text-slate-300 hover:text-slate-400"
            )}
          >
            <History className="w-6 h-6" strokeWidth={view === 'recap' ? 2.5 : 2} />
            <span className="text-[10px] font-black uppercase tracking-widest">Recap</span>
          </button>
        </nav>
        
        {/* Device bar */}
        <div className="h-1.5 w-32 bg-slate-200 mx-auto mb-3 rounded-full shrink-0"></div>
      </div>
    </div>
  );
}

function Scanner({ onResult }: { onResult: (text: string) => void }) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 220, height: 220 } },
      /* verbose= */ false
    );
    scannerRef.current.render(onScanSuccess, onScanFailure);

    function onScanSuccess(decodedText: string) {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
      onResult(decodedText);
    }

    function onScanFailure(error: any) {
      // quiet fail
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear();
      }
    };
  }, [onResult]);

  return (
    <div className="w-full aspect-[4/3] bg-slate-100 rounded-[2rem] overflow-hidden border-2 border-dashed border-slate-200 relative">
      <div id="reader" className="w-full h-full"></div>
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-56 h-56 border-2 border-blue-500/30 rounded-3xl relative overflow-hidden">
          <div className="absolute inset-x-0 h-[2px] bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.5)] animate-scan-line"></div>
          
          {/* Corners */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-600 rounded-tl-xl shadow-[-2px_-2px_10px_rgba(0,0,0,0.1)]"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-600 rounded-tr-xl"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-600 rounded-bl-xl"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-600 rounded-br-xl"></div>
        </div>
      </div>
    </div>
  );
}

function LiveTimer({ checkInTime }: { checkInTime: Date }) {
  const [seconds, setSeconds] = useState(0);
  const notifiedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = differenceInSeconds(new Date(), checkInTime);
      setSeconds(diff);
      
      if (diff >= 480 && !notifiedRef.current) {
        notifiedRef.current = true;
        toast.warning('Peringatan: Waktu cek kebugaran telah mencapai 8 menit!', {
          duration: 10000,
          icon: <AlertCircle className="w-5 h-5 text-orange-600" />
        });
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [checkInTime]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isOvertime = mins >= 8;

  return (
    <div className="flex items-center justify-between bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
      <div>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Duration Elapsed</p>
        <div className={cn(
          "text-4xl font-mono font-black tabular-nums tracking-tighter transition-colors",
          isOvertime ? "text-orange-500 animate-pulse" : "text-slate-800"
        )}>
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </div>
      <div className={cn(
        "p-4 rounded-full transition-all duration-500",
        isOvertime ? "bg-orange-100 scale-110" : "bg-blue-50"
      )}>
        {isOvertime ? (
          <AlertCircle className="w-8 h-8 text-orange-600" />
        ) : (
          <Timer className="w-8 h-8 text-blue-600" />
        )}
      </div>
      {isOvertime && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-orange-600 px-3 py-1 rounded-full border-2 border-white shadow-xl z-20">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          <span className="text-[9px] font-black text-white uppercase tracking-widest whitespace-nowrap">Exceeded 8 Min Limit</span>
        </div>
      )}
    </div>
  );
}

function RecapView({ records }: { records: AttendanceRecord[] }) {
  const handleDownloadExcel = () => {
    if (records.length === 0) {
      toast.error('Tidak ada data untuk diunduh');
      return;
    }

    const dataToExport = records.map(r => ({
      'Operator ID': r.operatorId,
      'Nama Operator': r.operatorName,
      'Tanggal': r.date,
      'Shift': r.shift,
      'Check In': r.checkInTime ? format(new Date(r.checkInTime as any), 'HH:mm:ss') : '-',
      'Check Out': r.checkOutTime ? format(new Date(r.checkOutTime as any), 'HH:mm:ss') : '-',
      'Durasi (Menit)': r.durationMinutes || 0,
      'Status': (r.durationMinutes || 0) >= 8 ? 'ALERT' : 'COMPLIANT'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Recap Absensi');

    // Generate filename based on date
    const filename = `Recap_Absensi_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
    
    XLSX.writeFile(workbook, filename);
    toast.success('Laporan Excel berhasil diunduh');
  };

  const getShiftData = (shift: 1 | 2) => {
    return records.filter(r => r.shift === shift);
  };

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="grid grid-cols-1 gap-4">
        <RecapCard 
          shift={1} 
          data={getShiftData(1)} 
          isActive={determineShift(new Date()) === 1}
        />
        <RecapCard 
          shift={2} 
          data={getShiftData(2)} 
          isActive={determineShift(new Date()) === 2}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Recent Activity Log</h3>
          <button 
            onClick={handleDownloadExcel}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-all active:scale-95"
          >
            <ShieldCheck className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Download Excel</span>
          </button>
        </div>
        <div className="space-y-3">
          {records.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-[2rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-3">
              <History className="w-8 h-8 text-slate-200" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No activity history yet</p>
            </div>
          ) : (
            records.slice(0, 10).map((r) => (
              <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shrink-0 transition-colors",
                    r.shift === 1 ? "bg-blue-50 text-blue-600" : "bg-slate-900 text-slate-100"
                  )}>
                    {r.operatorName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <span className="text-sm font-black block text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">{r.operatorName}</span>
                    <span className="text-[10px] text-slate-400 font-bold tracking-tight">{r.operatorId} - {r.shift === 1 ? 'Shift 1' : 'Shift 2'}</span>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-sm font-mono font-bold text-slate-800">{String(Math.floor((r.durationMinutes || 0))).padStart(2, '0')}:00</span>
                  <span className={cn(
                    "text-[8px] font-black uppercase px-2 py-0.5 rounded-md tracking-tighter mt-1",
                    (r.durationMinutes || 0) >= 8 ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600"
                  )}>
                    {(r.durationMinutes || 0) >= 8 ? "Alert" : "Compliant"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RecapCard({ shift, data, isActive }: { shift: 1 | 2; data: AttendanceRecord[]; isActive: boolean }) {
  const avgDuration = data.length > 0 
    ? (data.reduce((acc, curr) => acc + (curr.durationMinutes || 0), 0) / data.length).toFixed(1)
    : "0.0";
  
  const alertCount = data.filter(r => (r.durationMinutes || 0) >= 8).length;

  return (
    <div className={cn(
      "p-6 rounded-[2rem] border transition-all duration-500",
      isActive 
        ? "bg-white border-blue-500 shadow-xl shadow-blue-500/5 ring-1 ring-blue-500" 
        : "bg-slate-50/50 border-slate-100 grayscale opacity-60"
    )}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <span className={cn(
            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
            isActive ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
          )}>
            Shift {shift} {shift === 1 ? '(06:00-18:00)' : '(18:00-06:00)'}
          </span>
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Live</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-end border-b border-slate-100 pb-3">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Total Ops</p>
          <p className="text-2xl font-mono font-bold text-slate-800">{String(data.length).padStart(2, '0')}</p>
        </div>
        <div className="flex justify-between items-end border-b border-slate-100 pb-3">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Avg Duration</p>
          <p className={cn("text-2xl font-mono font-bold", isActive ? "text-blue-600" : "text-slate-800")}>
            {String(avgDuration).padStart(4, '0')}
          </p>
        </div>
        <div className="flex justify-between items-end">
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Over Limit</p>
          <p className={cn("text-2xl font-mono font-bold", alertCount > 0 ? "text-orange-500" : "text-slate-800")}>
            {String(alertCount).padStart(2, '0')}
          </p>
        </div>
      </div>
    </div>
  );
}
