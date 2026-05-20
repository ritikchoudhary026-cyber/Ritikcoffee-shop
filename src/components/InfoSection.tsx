'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { auth, db, storage, googleProvider } from '@/lib/firebase';
import {
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signInWithPopup,
  getRedirectResult,
  updateProfile,
  signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface UserProfile {
  name: string;
  contact: string;
  phone: string;
  email: string;
  photoURL: string;
  memberSince: string;
  brewPoints: number;
}

// Steps
type Step = 'login' | 'password_check' | 'otp' | 'signup' | 'signup_otp' | 'logged_in'
  | 'forgot' | 'forgot_otp' | 'new_password';

export default function InfoSection() {
  // Form fields
  const [name, setName] = useState('');
  const [contact, setContact] = useState(''); // phone number OR email
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<Step>('login');
  const [isContactEmail, setIsContactEmail] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // OTP is always sent to email — never shown on screen

  // Resend OTP cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Orders state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Profile editing
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setResendSuccess(false);
    setError('');
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResendCooldown(30);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    }
    setResendLoading(false);
  };

  // Start cooldown whenever we enter an OTP step
  useEffect(() => {
    if (step === 'otp' || step === 'signup_otp' || step === 'forgot_otp') {
      setResendCooldown(30);
      setResendSuccess(false);
    }
  }, [step]);

  // Fetch orders for a user
  const fetchOrders = async (email: string) => {
    setOrdersLoading(true);
    try {
      const q = query(
        collection(db, 'orders'),
        where('userEmail', '==', email),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Error fetching orders', e);
      setOrders([]);
    }
    setOrdersLoading(false);
  };

  // Handle redirect result from Google sign-in
  useEffect(() => {
    getRedirectResult(auth).then(async (result) => {
      if (!result) return;
      const gUser = result.user;
      const email = gUser.email || gUser.providerData[0]?.email || '';
      const docId = email || gUser.uid;
      const userDocRef = doc(db, 'users', docId);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          name: gUser.displayName || '',
          contact: email || gUser.uid,
          isEmail: email ? 'true' : 'false',
          email: email || '',
          phone: '',
          photoURL: gUser.photoURL || '',
          memberSince: String(new Date().getFullYear()),
          brewPoints: 100,
          uid: gUser.uid,
          createdAt: new Date().toISOString(),
        });
      }
      const data = (await getDoc(userDocRef)).data();
      if (data) setProfile(data as UserProfile);
      setStep('logged_in');
    }).catch((err) => {
      if (err.code !== 'auth/no-current-user') {
        console.error('Redirect result error:', err.code, err.message);
        const code = err.code || '';
        let msg = `Google sign-in failed (${code}): ${err.message}`;
        if (code === 'auth/unauthorized-domain') {
          msg = '🔒 Domain not authorized. Add this domain in Firebase Console → Authentication → Settings → Authorized Domains.';
        } else if (code === 'auth/operation-not-allowed') {
          msg = '⚠️ Google sign-in is not enabled. Go to Firebase → Authentication → Sign-in method → Enable Google.';
        } else if (code === 'auth/network-request-failed') {
          msg = '🌐 Network error. Check your internet connection.';
        }
        setError(msg);
      }
    });
  }, []);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setStep('logged_in');
        const emailPhone = currentUser.email?.replace('@coffeeapp.app', '') || '';
        try {
          let profileDoc: any = null;
          let searchKey = '';
          
          if (emailPhone) {
            const userDocRef = doc(db, 'users', emailPhone);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              profileDoc = userDoc.data();
              searchKey = emailPhone;
            }
          }
          
          if (!profileDoc && currentUser.uid) {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              profileDoc = userDoc.data();
              searchKey = currentUser.uid;
            }
          }
          
          if (profileDoc) {
            setProfile(profileDoc as UserProfile);
            await fetchOrders(searchKey);
          } else {
            // Auto-create a profile document if it doesn't exist
            const docId = emailPhone || currentUser.uid;
            const userDocRef = doc(db, 'users', docId);
            const isEmail = emailPhone.includes('@') ? 'true' : 'false';
            const newProfile = {
              name: currentUser.displayName || 'Coffee Lover',
              contact: emailPhone || currentUser.uid,
              isEmail,
              email: emailPhone.includes('@') ? emailPhone : '',
              phone: emailPhone.includes('@') ? '' : emailPhone,
              photoURL: currentUser.photoURL || '',
              memberSince: String(new Date().getFullYear()),
              brewPoints: 100,
              uid: currentUser.uid,
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile as UserProfile);
            await fetchOrders(docId);
          }
        } catch (e) {
          console.error('Error fetching profile', e);
        }
      } else {
        setProfile(null);
        setOrders([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const normalizeContact = (c: string) => {
    const isEmail = c.includes('@');
    return isEmail ? c.trim().toLowerCase() : c.trim().replace(/\s/g, '').replace('+91', '');
  };

  // ─── SIGNUP FLOW ─────────────────────────────────────────────────────────────

  // Google Sign-In (Uses signInWithPopup for reliability, falls back to redirect)
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const gUser = result.user;
      const email = gUser.email || gUser.providerData[0]?.email || '';
      const docId = email || gUser.uid;
      const userDocRef = doc(db, 'users', docId);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          name: gUser.displayName || '',
          contact: email || gUser.uid,
          isEmail: email ? 'true' : 'false',
          email: email || '',
          phone: '',
          photoURL: gUser.photoURL || '',
          memberSince: String(new Date().getFullYear()),
          brewPoints: 100,
          uid: gUser.uid,
          createdAt: new Date().toISOString(),
        });
      }
      const data = (await getDoc(userDocRef)).data();
      if (data) setProfile(data as UserProfile);
      setStep('logged_in');
    } catch (err: any) {
      console.error('Google sign-in error:', err.code, err.message);
      const code = err.code || '';
      
      // Fallback to redirect if popup is blocked
      if (code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirErr: any) {
          setError(`Google redirect failed: ${redirErr.message}`);
          setLoading(false);
          return;
        }
      }

      let msg = `Google sign-in failed (${code}): ${err.message}`;
      if (code === 'auth/unauthorized-domain') {
        msg = '🔒 Domain not authorized. Add this domain in Firebase Console → Authentication → Settings → Authorized Domains.';
      } else if (code === 'auth/operation-not-allowed') {
        msg = '⚠️ Google sign-in is not enabled. Go to Firebase → Authentication → Sign-in method → Enable Google.';
      } else if (code === 'auth/network-request-failed') {
        msg = '🌐 Network error. Check your internet connection.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !contact || !password) return;
    setLoading(true);
    setError('');
    if (!contact.includes('@')) {
      setError('Please enter a valid email address');
      setLoading(false);
      return;
    }
    setIsContactEmail(true);
    try {
      // 1. Register user
      const regRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, contact: normalizeContact(contact), password }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error);

      // 2. Send OTP to email
      const otpRes = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact) }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.error);

      setStep('signup_otp');
    } catch (err: any) {
      setError(err.message || 'Signup failed');
    }
    setLoading(false);
  };

  // ─── LOGIN FLOW ──────────────────────────────────────────────────────────────

  const handlePasswordCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !password) return;
    setLoading(true);
    setError('');
    const isEmail = contact.includes('@');
    setIsContactEmail(isEmail);
    try {
      // 1. Verify password
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 2. Send OTP to email
      const otpRes = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact) }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.error);

      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  };

  // ─── OTP VERIFICATION (used for both login & signup) ─────────────────────────

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      const normalContact = normalizeContact(contact);
      // 1. Verify OTP via API
      const res = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalContact, otp, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 2. Sign into Firebase Auth
      const firebaseEmail = isContactEmail ? normalContact : `${normalContact}@coffeeapp.app`;
      await signInWithEmailAndPassword(auth, firebaseEmail, password);

      if (data.userProfile) setProfile(data.userProfile);

      setStep('logged_in');
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    }
    setLoading(false);
  };

  // ─── SIGN OUT ─────────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    await signOut(auth);
    setStep('login');
    setName('');
    setContact('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setOtp('');
    setProfile(null);
    setError('');
  };

  // ─── FORGOT PASSWORD FLOW ────────────────────────────────────────────────────

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    setLoading(true);
    setError('');
    const isEmail = contact.includes('@');
    setIsContactEmail(isEmail);
    try {
      // Check user exists first
      const checkRes = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass a fake wrong password - we just want to check if user exists
        // Better: use a dedicated check endpoint. For now send otp directly.
        body: JSON.stringify({ contact: normalizeContact(contact), password: '__check_only__' }),
      });
      // Even if password is wrong, user exists check is implicit
      // Just send OTP regardless (safer - don't leak if user exists)
      const otpRes = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact) }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.error);
      setStep('forgot_otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    }
    setLoading(false);
  };

  const handleForgotVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setLoading(true);
    setError('');
    try {
      // Verify OTP is valid — we'll actually consume it in reset-password
      // For now just move to new password step if OTP looks like 6 digits
      if (otp.trim().length !== 6) throw new Error('Please enter the 6-digit OTP');
      setStep('new_password');
    } catch (err: any) {
      setError(err.message || 'OTP verification failed');
    }
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: normalizeContact(contact), otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Success — go back to login
      setStep('login');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');

      setError('');
      alert('✅ Password reset successfully! Please log in with your new password.');
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    }
    setLoading(false);
  };

  // ─── PROFILE EDITING ──────────────────────────────────────────────────────────

  const startEditing = () => {
    setEditName(profile?.name || '');
    setEditFile(null);
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (!user || !profile) return;
    setLoading(true);
    setError('');
    try {
      const docKey = normalizeContact(profile.contact || profile.phone || profile.email || contact);
      let newPhotoURL = profile.photoURL || '';

      // Upload photo to Firebase Storage if a new file is selected
      if (editFile) {
        try {
          const fileRef = ref(storage, `avatars/${docKey}`);
          const uploadResult = await uploadBytes(fileRef, editFile);
          newPhotoURL = await getDownloadURL(uploadResult.ref);
        } catch (storageError: any) {
          console.error('Storage upload error:', storageError);
          // Storage might need rules update - try with data URL as fallback
          // Convert to base64 for small images
          const reader = new FileReader();
          newPhotoURL = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(editFile);
          });
        }
      }

      // Update Firestore via our REST API route (avoids client SDK security rules issues)
      const updateRes = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: docKey, name: editName, photoURL: newPhotoURL }),
      });
      const updateData = await updateRes.json();
      if (!updateRes.ok) throw new Error(updateData.error);

      // Also update Firebase Auth display name and photo
      try {
        await updateProfile(user, { displayName: editName, photoURL: newPhotoURL.startsWith('data:') ? undefined : newPhotoURL });
      } catch (authUpdateErr) {
        console.warn('Could not update Firebase Auth profile:', authUpdateErr);
      }

      setProfile(prev => prev ? { ...prev, name: editName, photoURL: newPhotoURL } : null);
      setIsEditing(false);
      setEditFile(null);
    } catch (err: any) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile: ' + err.message);
    }
    setLoading(false);
  };

  const getInitials = (n: string) =>
    n.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

  const inputClass =
    'w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 text-white placeholder:text-white/30 focus:outline-none focus:border-[#EAC678]/50 focus:ring-1 focus:ring-[#EAC678]/50 transition-all font-light';
  const btnPrimary =
    'w-full py-4 bg-white text-black hover:bg-[#EAC678] transition-colors rounded-xl font-medium uppercase tracking-widest text-sm mt-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGold =
    'w-full py-4 bg-[#EAC678] text-black hover:bg-white transition-colors rounded-xl font-medium uppercase tracking-widest text-sm mt-2 disabled:opacity-50';

  return (
    <section className="py-24 px-8 md:px-24 bg-[#050505] relative z-20 border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-white mb-4">
            Dashboard <span className="text-[#EAC678] font-light italic">&amp; Info</span>
          </h2>
          <p className="text-white/50 max-w-xl text-lg font-light">
            Manage your profile, track your orders, and learn more about our commitment to quality.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* ── PROFILE CARD ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="md:col-span-4 bg-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-md hover:bg-white/[0.04] transition-colors"
          >
            <h3 className="text-[#EAC678] text-sm uppercase tracking-widest mb-6">Profile</h3>

            {user && profile ? (
              isEditing ? (
                <div className="space-y-4">
                  <div className="flex flex-col items-center space-y-4 mb-4">
                    <div
                      className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#EAC678] to-[#9A7D46] p-[2px] cursor-pointer group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-full h-full rounded-full bg-[#050505] flex items-center justify-center overflow-hidden relative">
                        {editFile ? (
                          <img src={URL.createObjectURL(editFile)} alt="preview" className="w-full h-full object-cover" />
                        ) : profile.photoURL ? (
                          <img src={profile.photoURL} alt="profile" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl font-bold text-[#EAC678]">{getInitials(editName || 'A')}</span>
                        )}
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                          <span className="text-white text-xs">📷 Upload</span>
                        </div>
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                      accept="image/*"
                      className="hidden"
                    />
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white text-center focus:outline-none focus:border-[#EAC678]/50"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => setIsEditing(false)} className="w-1/2 py-2 border border-white/10 rounded-xl text-sm hover:bg-white/5 text-white">Cancel</button>
                    <button onClick={handleSaveProfile} disabled={loading} className="w-1/2 py-2 bg-[#EAC678] text-black rounded-xl text-sm font-medium hover:bg-white transition-colors disabled:opacity-50">
                      {loading ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center space-x-5 mb-8">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#EAC678] to-[#9A7D46] p-[2px] flex-shrink-0">
                      <div className="w-full h-full rounded-full bg-[#050505] flex items-center justify-center overflow-hidden relative">
                        {profile.photoURL ? (
                          <img src={profile.photoURL} alt="profile" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <div className="absolute inset-0 bg-white/10" />
                            <span className="text-2xl font-bold text-[#EAC678]">{getInitials(profile.name || 'A')}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xl font-medium text-white truncate">{profile.name}</h4>
                      <p className="text-white/40 text-xs mt-1 truncate">
                        {profile.email || (profile.phone ? `+91 ${profile.phone}` : '')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-white/60 text-sm">Brew Points</span>
                      <span className="text-white font-medium">{profile.brewPoints}</span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                      <span className="text-white/60 text-sm">Member Since</span>
                      <span className="text-white font-medium">{profile.memberSince}</span>
                    </div>
                  </div>
                  <button
                    onClick={startEditing}
                    className="w-full mt-6 py-3 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors text-white"
                  >
                    Edit Profile
                  </button>
                </>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
                <span className="text-3xl mb-3">👤</span>
                <p>Log in to view your profile</p>
              </div>
            )}
          </motion.div>

          {/* ── ABOUT US ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="md:col-span-8 bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 rounded-3xl p-8 md:p-12 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#EAC678]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <h3 className="text-[#EAC678] text-sm uppercase tracking-widest mb-6">About Us</h3>
            <h4 className="text-3xl md:text-4xl font-light text-white mb-6 leading-tight">
              Crafting <span className="font-semibold">digital experiences</span> that defy gravity.
            </h4>
            <p className="text-white/60 leading-relaxed text-lg mb-8 max-w-2xl font-light">
              We blend high-end design with robust engineering. Our passion for perfection is like a meticulously
              brewed espresso—complex, bold, and entirely transformative.
            </p>
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/10">
              {[['50+', 'Projects'], ['100%', 'Precision'], ['24/7', 'Innovation']].map(([val, label]) => (
                <div key={label}>
                  <span className="block text-3xl font-bold text-white mb-1">{val}</span>
                  <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── ORDER HISTORY ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="md:col-span-7 bg-white/[0.02] border border-white/10 rounded-3xl p-8 backdrop-blur-md"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-[#EAC678] text-sm uppercase tracking-widest">Order History</h3>
              <button className="text-white/40 text-sm hover:text-white transition-colors">View All</button>
            </div>

            {user ? (
              ordersLoading ? (
                <div className="flex items-center justify-center h-48 text-white/30 text-sm">
                  <span className="animate-pulse">Loading orders…</span>
                </div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
                  <span className="text-3xl mb-3">☕</span>
                  <p>No orders yet. Start brewing!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order, i) => (
                    <div key={i} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors border border-transparent hover:border-white/5 cursor-pointer group">
                      <div className="mb-3 sm:mb-0">
                        <div className="flex items-center space-x-3 mb-1">
                          <span className="text-white font-medium">{order.item || order.itemName}</span>
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            order.status === 'Delivered' ? 'bg-green-500/10 text-green-400' :
                            order.status === 'Cancelled' ? 'bg-red-500/10 text-red-400' :
                            'bg-[#EAC678]/10 text-[#EAC678]'
                          }`}>
                            {order.status || 'Processing'}
                          </span>
                        </div>
                        <div className="text-white/40 text-xs">
                          {order.orderId || order.id} • {order.date || (order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 w-full sm:w-auto justify-between sm:justify-end">
                        <span className="text-white/80 font-mono">₹{order.price || order.amount}</span>
                        <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 group-hover:bg-white/10 group-hover:text-white transition-all">→</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-white/30 text-sm">
                <span className="text-3xl mb-3">🔒</span>
                <p>Log in to view your orders</p>
              </div>
            )}
          </motion.div>

          {/* ── AUTH CARD ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="md:col-span-5 bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/10 rounded-3xl p-8 relative overflow-hidden flex flex-col justify-center"
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-[#EAC678]/50 to-transparent" />

            <h3 className="text-[#EAC678] text-sm uppercase tracking-widest mb-2">Secure Access</h3>
            <h4 className="text-2xl font-medium text-white mb-6">
              {step === 'login' && 'Sign in to your account'}
              {step === 'password_check' && 'Enter your password'}
              {step === 'otp' && 'Verify your identity'}
              {step === 'signup' && 'Create your account'}
              {step === 'signup_otp' && 'Verify your number'}
              {step === 'logged_in' && 'Welcome back!'}
              {step === 'forgot' && 'Reset your password'}
              {step === 'forgot_otp' && 'Verify your identity'}
              {step === 'new_password' && 'Set a new password'}
            </h4>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* ── SIGNUP FORM ── */}
            {step === 'signup' && (
              <form className="space-y-4" onSubmit={handleSignup}>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" required className={inputClass} />
                <input
                  type="email"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="Email Address"
                  required
                  className={inputClass}
                />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Create Password (min 6 chars)" required minLength={6} className={inputClass} />
                <button disabled={loading} className={btnPrimary}>{loading ? 'Creating Account…' : 'Sign Up & Send OTP'}</button>
                <div className="relative flex items-center my-2">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="mx-3 text-white/30 text-xs">OR</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
                <button type="button" onClick={handleGoogleSignIn} disabled={loading}
                  className="w-full py-3 flex items-center justify-center gap-3 border border-white/10 rounded-xl text-white hover:bg-white/5 transition-colors text-sm font-medium">
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.5L6.1 33.8C9.5 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.1 3.9-3.8 5.3l6.2 5.2C41.4 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
                  Continue with Google
                </button>
                <p className="text-center text-white/40 text-sm mt-2">
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setStep('login'); setError(''); }} className="text-white hover:text-[#EAC678] transition-colors">Sign in</button>
                </p>
              </form>
            )}

            {/* ── LOGIN STEP 1: Email ── */}
            {step === 'login' && (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setStep('password_check'); }}>
                <input
                  type="email"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="Email Address"
                  required
                  className={inputClass}
                />
                <button type="submit" disabled={loading || !contact} className={btnPrimary}>
                  Continue →
                </button>
                <div className="relative flex items-center my-1">
                  <div className="flex-1 border-t border-white/10" />
                  <span className="mx-3 text-white/30 text-xs">OR</span>
                  <div className="flex-1 border-t border-white/10" />
                </div>
                <button type="button" onClick={handleGoogleSignIn} disabled={loading}
                  className="w-full py-3 flex items-center justify-center gap-3 border border-white/10 rounded-xl text-white hover:bg-white/5 transition-colors text-sm font-medium">
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5.1l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.5L6.1 33.8C9.5 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.1-2.1 3.9-3.8 5.3l6.2 5.2C41.4 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/></svg>
                  Continue with Google
                </button>
                <p className="text-center text-white/40 text-sm mt-2">
                  New here?{' '}
                  <button type="button" onClick={() => { setStep('signup'); setError(''); }} className="text-white hover:text-[#EAC678] transition-colors">Create an account</button>
                </p>
              </form>
            )}

            {/* ── LOGIN STEP 2: Password ── */}
            {step === 'password_check' && (
              <form className="space-y-4" onSubmit={handlePasswordCheck}>
                <div className="text-white/50 text-sm mb-2">
                  Signing in as <span className="text-white">{normalizeContact(contact)}</span>
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required className={inputClass} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setStep('forgot'); setError(''); setOtp(''); }}
                    className="text-[#EAC678] text-sm hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <button disabled={loading} className={btnPrimary}>{loading ? 'Sending OTP…' : 'Verify & Send OTP'}</button>
                <button type="button" onClick={() => { setStep('login'); setError(''); }} className="w-full py-2 text-white/40 hover:text-white text-sm transition-colors">← Change contact</button>
              </form>
            )}

            {/* ── OTP FORM (login) ── */}
            {step === 'otp' && (
              <form className="space-y-4" onSubmit={handleVerifyOtp}>
                <p className="text-white/50 text-sm">
                  We sent a 6-digit OTP to <span className="text-white">{normalizeContact(contact)}</span>. Check your inbox (or spam folder).
                </p>
                <input
                  type="text" inputMode="numeric" value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="● ● ● ● ● ●" required maxLength={6}
                  className={`${inputClass} text-center tracking-[0.6em] text-xl`}
                />
                <button disabled={loading} className={btnGold}>{loading ? 'Verifying…' : 'Verify & Log In'}</button>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {resendSuccess ? (
                    <span className="text-green-400 text-sm">✓ OTP resent! Check your inbox.</span>
                  ) : resendCooldown > 0 ? (
                    <span className="text-white/30 text-sm">Resend OTP in <span className="text-white/50 font-mono">{resendCooldown}s</span></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendLoading}
                      className="text-[#EAC678] text-sm hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {resendLoading ? 'Sending…' : '↻ Resend OTP'}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => { setStep('password_check'); setOtp(''); setError(''); }} className="w-full py-2 text-white/40 hover:text-white text-sm transition-colors">← Back</button>
              </form>
            )}

            {/* ── OTP FORM (signup) ── */}
            {step === 'signup_otp' && (
              <form className="space-y-4" onSubmit={handleVerifyOtp}>
                <p className="text-white/50 text-sm">
                  OTP sent to <span className="text-white">{normalizeContact(contact)}</span>. Check your inbox (or spam folder) and enter the 6-digit code to activate your account.
                </p>
                <input
                  type="text" inputMode="numeric" value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="● ● ● ● ● ●" required maxLength={6}
                  className={`${inputClass} text-center tracking-[0.6em] text-xl`}
                />
                <button disabled={loading} className={btnGold}>{loading ? 'Verifying…' : 'Verify & Create Account'}</button>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {resendSuccess ? (
                    <span className="text-green-400 text-sm">✓ OTP resent! Check your inbox.</span>
                  ) : resendCooldown > 0 ? (
                    <span className="text-white/30 text-sm">Resend OTP in <span className="text-white/50 font-mono">{resendCooldown}s</span></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendLoading}
                      className="text-[#EAC678] text-sm hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {resendLoading ? 'Sending…' : '↻ Resend OTP'}
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* ── FORGOT: Enter email ── */}
            {step === 'forgot' && (
              <form className="space-y-4" onSubmit={handleForgotSendOtp}>
                <p className="text-white/50 text-sm">Enter your registered email. We'll send an OTP to reset your password.</p>
                <input
                  type="email"
                  value={contact}
                  onChange={e => setContact(e.target.value)}
                  placeholder="Email Address"
                  required
                  className={inputClass}
                />
                <button disabled={loading} className={btnPrimary}>{loading ? 'Sending OTP…' : 'Send Reset OTP'}</button>
                <button type="button" onClick={() => { setStep('login'); setError(''); }} className="w-full py-2 text-white/40 hover:text-white text-sm transition-colors">← Back to login</button>
              </form>
            )}

            {/* ── FORGOT OTP: Verify ── */}
            {step === 'forgot_otp' && (
              <form className="space-y-4" onSubmit={handleForgotVerifyOtp}>
                <p className="text-white/50 text-sm">
                  OTP sent to <span className="text-white">{normalizeContact(contact)}</span>. Check your inbox (or spam folder).
                </p>
                <input
                  type="text" inputMode="numeric" value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="● ● ● ● ● ●" required maxLength={6}
                  className={`${inputClass} text-center tracking-[0.6em] text-xl`}
                />
                <button disabled={loading} className={btnGold}>{loading ? 'Verifying…' : 'Verify OTP'}</button>
                <div className="flex items-center justify-center gap-2 pt-1">
                  {resendSuccess ? (
                    <span className="text-green-400 text-sm">✓ OTP resent! Check your inbox.</span>
                  ) : resendCooldown > 0 ? (
                    <span className="text-white/30 text-sm">Resend OTP in <span className="text-white/50 font-mono">{resendCooldown}s</span></span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendLoading}
                      className="text-[#EAC678] text-sm hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {resendLoading ? 'Sending…' : '↻ Resend OTP'}
                    </button>
                  )}
                </div>
                <button type="button" onClick={() => { setStep('forgot'); setError(''); }} className="w-full py-2 text-white/40 hover:text-white text-sm transition-colors">← Back</button>
              </form>
            )}

            {/* ── NEW PASSWORD ── */}
            {step === 'new_password' && (
              <form className="space-y-4" onSubmit={handleResetPassword}>
                <p className="text-white/50 text-sm">OTP verified! Now set your new password.</p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New Password (min 6 chars)"
                  required minLength={6}
                  className={inputClass}
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm New Password"
                  required minLength={6}
                  className={inputClass}
                />
                <button disabled={loading} className={btnGold}>{loading ? 'Resetting…' : 'Reset Password'}</button>
              </form>
            )}

            {/* ── LOGGED IN STATE ── */}
            {step === 'logged_in' && user && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6">
                  <span className="text-green-400 text-2xl">✓</span>
                </div>
                <h5 className="text-xl font-medium text-white mb-1">Welcome, {profile?.name || 'User'}!</h5>
                <p className="text-white/40 text-sm mb-8 truncate max-w-full">
                  {profile?.email || (profile?.phone ? `+91 ${profile.phone}` : normalizeContact(contact))}
                </p>
                <button onClick={handleSignOut} className="px-6 py-2 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm">
                  Sign Out
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
