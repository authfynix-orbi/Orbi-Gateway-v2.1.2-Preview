import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import { Smartphone, Battery, Signal, Clock, Trash2, Shield, AlertCircle, CheckCircle2, X, Download, Link as LinkIcon, FileText, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface Device {
  id: string;
  name: string;
  model: string;
  androidVersion: string;
  batteryLevel: number;
  status: 'online' | 'offline' | 'busy';
  lastSeen: any;
  ownerUid: string;
}

interface LiveDeviceStatus {
  deviceId: string;
  status: 'online' | 'offline' | 'busy';
  liveConnected: boolean;
  heartbeatAlive: boolean;
  lastHeartbeatAt: string | null;
  heartbeatAgeMs: number | null;
  heartbeatAgeSeconds: number | null;
  batteryLevel: number | null;
}

export default function DeviceManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [liveStatusByDevice, setLiveStatusByDevice] = useState<Record<string, LiveDeviceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [isAddDeviceModalOpen, setIsAddDeviceModalOpen] = useState(false);
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [initialOnlineCount, setInitialOnlineCount] = useState<number | null>(null);
  const [initialDeviceCount, setInitialDeviceCount] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pairingUrl, setPairingUrl] = useState(window.location.origin);
  const [pairingOwnerUid, setPairingOwnerUid] = useState(auth.currentUser?.uid || '');
  const [pairingCode, setPairingCode] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAddDeviceModalOpen || !auth.currentUser) return;

    const loadPairingConfig = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/pairing-config', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load pairing config');
        }
        setPairingUrl(payload.gatewayUrl || window.location.origin);
        setPairingOwnerUid(payload.ownerUid || auth.currentUser?.uid || '');
        setPairingCode(payload.pairingCode || '');
      } catch (error) {
        console.error('Failed to load pairing config:', error);
        setPairingUrl(window.location.origin);
        setPairingOwnerUid(auth.currentUser?.uid || '');
        setPairingCode('');
      }
    };

    loadPairingConfig();
  }, [isAddDeviceModalOpen]);

  const getDerivedStatus = (device: Device) => {
    const liveStatus = liveStatusByDevice[device.id];
    if (liveStatus?.heartbeatAlive) {
      return liveStatus.status || 'online';
    }
    if (device.status === 'offline') return 'offline';
    if (!device.lastSeen) return 'offline';
    
    const lastSeenDate = device.lastSeen?.toDate?.() || new Date(0);
    const diffSeconds = (currentTime.getTime() - lastSeenDate.getTime()) / 1000;
    
    // Heartbeats are persisted every 5 minutes to keep Firestore costs down,
    // so derived status should allow a much wider freshness window.
    if (diffSeconds > 12 * 60) {
      return 'offline';
    }
    return device.status;
  };

  const getHeartbeatLabel = (device: Device) => {
    const liveStatus = liveStatusByDevice[device.id];
    if (liveStatus?.heartbeatAlive && liveStatus.heartbeatAgeSeconds != null) {
      return `Live ${liveStatus.heartbeatAgeSeconds}s ago`;
    }
    if (liveStatus && liveStatus.lastHeartbeatAt) {
      return `Last live beat ${new Date(liveStatus.lastHeartbeatAt).toLocaleTimeString()}`;
    }
    return `Persisted ${device.lastSeen?.toDate?.()?.toLocaleTimeString() || 'Never'}`;
  };

  const getDisplayedBatteryLevel = (device: Device) =>
    liveStatusByDevice[device.id]?.batteryLevel ?? device.batteryLevel ?? 0;

  const activeOnlineCount = devices.filter(d => getDerivedStatus(d) === 'online').length;

  useEffect(() => {
    if (isAddDeviceModalOpen) {
      const currentDeviceCount = devices.length;
      
      if (initialOnlineCount === null || initialDeviceCount === null) {
        setInitialOnlineCount(activeOnlineCount);
        setInitialDeviceCount(currentDeviceCount);
      } else if (activeOnlineCount > initialOnlineCount || currentDeviceCount > initialDeviceCount) {
        setIsAddDeviceModalOpen(false);
      }
    } else {
      setInitialOnlineCount(null);
      setInitialDeviceCount(null);
    }
  }, [devices, activeOnlineCount, isAddDeviceModalOpen, initialOnlineCount, initialDeviceCount]);

  useEffect(() => {
    if (!db || !auth.currentUser) return;

    const setupListener = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin = (userDoc.exists() && userDoc.data().role === 'admin') || 
                        (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);

        const q = isAdmin 
          ? query(collection(db, 'devices'))
          : query(collection(db, 'devices'), where('ownerUid', '==', auth.currentUser!.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const deviceList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Device[];
          setDevices(deviceList);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'devices');
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error setting up device listener:", error);
        setLoading(false);
      }
    };

    let unsubscribe: (() => void) | undefined;
    setupListener().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [auth.currentUser]);

  useEffect(() => {
    if (!auth.currentUser || devices.length === 0) {
      setLiveStatusByDevice({});
      return;
    }

    let cancelled = false;

    const fetchLiveStatuses = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token || cancelled) return;

        const deviceIds = devices.map((device) => device.id).filter(Boolean);
        if (deviceIds.length === 0) {
          if (!cancelled) {
            setLiveStatusByDevice({});
          }
          return;
        }

        const params = new URLSearchParams({
          deviceIds: deviceIds.join(','),
        });
        const response = await fetch(`/api/devices/live-status?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) return;

        const nextState = (Array.isArray(payload.devices) ? payload.devices : []).reduce(
          (acc: Record<string, LiveDeviceStatus>, entry: LiveDeviceStatus) => {
            if (entry?.deviceId) {
              acc[entry.deviceId] = entry;
            }
            return acc;
          },
          {},
        );
        setLiveStatusByDevice(nextState);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load live device state:', error);
        }
      }
    };

    fetchLiveStatuses();
    const interval = setInterval(fetchLiveStatuses, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [devices]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-emerald-500';
      case 'offline': return 'bg-slate-400';
      case 'busy': return 'bg-amber-500';
      default: return 'bg-slate-400';
    }
  };

  const getBatteryColor = (level: number) => {
    if (level > 70) return 'text-emerald-500';
    if (level > 20) return 'text-amber-500';
    return 'text-red-500';
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!db || !auth.currentUser) return;
    
    if (window.confirm('Are you sure you want to delete this device? This action cannot be undone.')) {
      try {
        await deleteDoc(doc(db, 'devices', deviceId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `devices/${deviceId}`);
      }
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Connected Devices</h1>
          <p className="text-slate-500 font-medium">Manage your Android SMS sending nodes.</p>
        </div>
        <div className="flex items-center gap-4 enterprise-card px-6 py-3">
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Nodes</p>
            <p className="text-xl font-black text-slate-900">{activeOnlineCount}</p>
          </div>
          <div className="w-px h-8 bg-slate-100"></div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Registered</p>
            <p className="text-xl font-black text-slate-900">{devices.length}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 enterprise-card border-dashed border-slate-300">
          <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Smartphone className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">No devices connected</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2">
            Install the ORBI Gateway Android app on your devices to start sending messages.
          </p>
          <button 
            onClick={() => setIsAddDeviceModalOpen(true)}
            className="mt-8 bg-slate-900 text-white px-8 py-3 rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-200"
          >
            Connect New Device
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {devices.map((device) => (
            <div key={device.id} className="enterprise-card p-6 hover:shadow-xl transition-all group relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-5 transition-transform group-hover:scale-110 ${getStatusColor(getDerivedStatus(device))}`}></div>
              
              <div className="flex items-start justify-between mb-6 relative z-10">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                    getDerivedStatus(device) === 'online' ? 'bg-emerald-50' : 'bg-slate-50'
                  }`}>
                    <Smartphone className={`w-7 h-7 ${
                      getDerivedStatus(device) === 'online' ? 'text-emerald-600' : 'text-slate-400'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 leading-tight">{device.name || device.model}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ID: {device.id.slice(0, 8)}...</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white ${getStatusColor(getDerivedStatus(device))}`}>
                    {getDerivedStatus(device) === 'online' && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>}
                    {getDerivedStatus(device)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Battery className={`w-3.5 h-3.5 ${getBatteryColor(device.batteryLevel || 0)}`} />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Battery</span>
                  </div>
                  <p className="text-sm font-black text-slate-900">{getDisplayedBatteryLevel(device)}%</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Signal className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Android</span>
                  </div>
                  <p className="text-sm font-black text-slate-900">v{device.androidVersion || 'Unknown'}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 relative z-10">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500">
                    {getHeartbeatLabel(device)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all">
                    <Shield className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteDevice(device.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full -mr-48 -mt-48 blur-3xl"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 rounded-full border border-indigo-500/30">
              <CheckCircle2 className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">System Status: Optimal</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight leading-tight">Ready to scale your SMS infrastructure?</h2>
            <p className="text-slate-400 font-medium">
              Connect multiple Android devices to distribute load and ensure 99.9% delivery rates. Our gateway automatically handles load balancing and failover.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => setIsAddDeviceModalOpen(true)}
              className="enterprise-button-primary px-8 py-4 font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-500/10"
            >
              Add New Device
            </button>
            <button 
              onClick={() => setIsDocsModalOpen(true)}
              className="bg-slate-800 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-700 transition-all border border-slate-700"
            >
              View Documentation
            </button>
          </div>
        </div>
      </div>

      {/* Add Device Modal */}
      {isAddDeviceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="enterprise-card w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Connect New Device</h2>
                  <p className="text-slate-500 text-sm font-medium mt-1">Follow these steps to link an Android device to your ORBI Gateway.</p>
                </div>
                <button
                  onClick={() => setIsAddDeviceModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black shrink-0">1</div>
                  <div>
                    <h3 className="font-bold text-slate-900">Download the ORBI Gateway APK</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-3">Install the gateway application on your dedicated Android device.</p>
                    <button className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl font-bold hover:bg-indigo-100 transition-all text-sm">
                      <Download className="w-4 h-4" />
                      Download APK (v1.0.1)
                    </button>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black shrink-0">2</div>
                  <div className="w-full">
                    <h3 className="font-bold text-slate-900">Configure Connection</h3>
                    <p className="text-sm text-slate-500 mt-1 mb-3">Open the app and scan this QR code, or enter your details manually.</p>
                    
                    <div className="flex flex-col sm:flex-row gap-6">
                      <div className="flex-shrink-0 enterprise-card p-4 flex flex-col items-center justify-center gap-3">
                        <QRCodeSVG 
                          value={JSON.stringify({
                            url: pairingUrl,
                            uid: pairingOwnerUid,
                            pairingCode,
                          })} 
                          size={140} 
                          level="H" 
                          includeMargin={false} 
                        />
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <QrCode className="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Scan to Connect</span>
                        </div>
                      </div>

                      <div className="flex-1 bg-slate-50 p-4 rounded-3xl border border-slate-200 space-y-3 flex flex-col justify-center">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gateway URL</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs font-mono border border-slate-200 text-slate-700 select-all">
                              {pairingUrl}
                            </code>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Owner UID</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs font-mono border border-slate-200 text-slate-700 select-all">
                              {pairingOwnerUid || 'Not authenticated'}
                            </code>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pairing Code</label>
                          <div className="flex items-center gap-2 mt-1">
                            <code className="flex-1 bg-white px-3 py-2 rounded-lg text-xs font-mono border border-slate-200 text-slate-700 select-all">
                              {pairingCode || 'Loading...'}
                            </code>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-black shrink-0">3</div>
                  <div>
                    <h3 className="font-bold text-slate-900">Grant Permissions</h3>
                    <p className="text-sm text-slate-500 mt-1">Allow the app to send SMS messages and run in the background. The device will automatically appear in your dashboard once connected.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsAddDeviceModalOpen(false)}
                  className="w-full bg-slate-900 text-white px-6 py-3.5 rounded-xl font-black hover:bg-black transition-all shadow-lg shadow-slate-200"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Documentation Modal */}
      {isDocsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
          <div className="enterprise-card w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">API Documentation</h2>
                    <p className="text-slate-500 text-sm font-medium">How to send messages via ORBI Gateway</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDocsModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="prose prose-slate max-w-none">
                <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    Endpoint
                  </h3>
                  <code className="block bg-slate-900 text-emerald-400 p-4 rounded-xl text-sm font-mono shadow-inner">
                    POST {window.location.origin}/api/send-template
                  </code>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-4">Request Payload</h3>
                  <pre className="bg-slate-900 text-slate-300 p-6 rounded-2xl text-sm font-mono shadow-inner overflow-x-auto">
{`{
  "templateName": "OTP_Message",
  "recipient": "+255764258114",
  "data": {
    "otp": "839201",
    "androidHash": "F06swEpWoT9"
  },
  "channel": "sms",
  "language": "en",
  "messageType": "transactional",
  "ownerUid": "${auth.currentUser?.uid || 'YOUR_UID'}"
}`}
                  </pre>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="enterprise-card p-4">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">templateName</h4>
                    <p className="text-xs text-slate-500">The exact name/ID of the template created in the dashboard.</p>
                  </div>
                  <div className="enterprise-card p-4">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">recipient</h4>
                    <p className="text-xs text-slate-500">The destination phone number in E.164 format (e.g., +255...).</p>
                  </div>
                  <div className="enterprise-card p-4">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">data</h4>
                    <p className="text-xs text-slate-500">Key-value pairs to replace {'{{variables}}'} in your template.</p>
                  </div>
                  <div className="enterprise-card p-4">
                    <h4 className="font-bold text-slate-900 text-sm mb-1">ownerUid</h4>
                    <p className="text-xs text-slate-500">Your unique user ID to authenticate the request and route to your devices.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
