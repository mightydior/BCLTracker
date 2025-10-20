import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  initializeApp
} from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  Timestamp,
  setDoc,
  getDoc,
  setLogLevel
} from 'firebase/firestore';
import { Star, Trash2, Search, Share2, Home, Hash, Zap, Send, User, Calendar, MapPin, Coffee, Brain, Sun, Sparkles } from 'lucide-react';

// --- Global Variables (Mandatory for Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const apiKey = ""; // API Key for Gemini
// --- End Global Variables ---

// Set the log level for detailed Firestore debugging
setLogLevel('debug');

// Hardcoded Data
const US_CANNABIS_LEGALITY = {
  'Alabama': { status: 'Illegal', color: 'bg-red-900', text: 'text-red-300' },
  'Alaska': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Arizona': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'California': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Colorado': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Delaware': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Florida': { status: 'Medicinal', color: 'bg-orange-700', text: 'text-orange-200' },
  'Georgia': { status: 'Medicinal', color: 'bg-orange-700', text: 'text-orange-200' },
  'Illinois': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Maryland': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Michigan': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'New York': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'North Carolina': { status: 'Medicinal (Low THC)', color: 'bg-orange-700', text: 'text-orange-200' },
  'Texas': { status: 'Medicinal (Low THC)', color: 'bg-orange-700', text: 'text-orange-200' },
  'Virginia': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Washington': { status: 'Recreational', color: 'bg-teal-700', text: 'text-teal-200' },
  'Wisconsin': { status: 'Illegal', color: 'bg-red-900', text: 'text-red-300' },
};
const US_STATES = Object.keys(US_CANNABIS_LEGALITY).sort();

const TOP_TERPENES = [
  'Beta-Caryophyllene', 'Caryophyllene Oxide', 'Eucalyptol', 'Fenchol', 'Humulene',
  'Limonene', 'Linalool', 'Myrcene', 'Ocimene', 'Pinene', 'Terpineol', 'Terpinolene'
].sort();

const strainTypes = ['Hybrid', 'Indica', 'Sativa'];
const productTypes = ['Flower', 'Edible', 'Concentrate', 'Vape', 'Tincture', 'Topical'];


// --- Utility Functions ---

/**
 * Executes a fetch request with exponential backoff for resilience.
 */
const fetchWithBackoff = async (url, options, maxRetries = 5) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      // If response is not OK, throw error to trigger retry
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (error) {
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

/**
 * Call the Gemini API to analyze user effects notes.
 */
const analyzeEffects = async (effectsText) => {
  if (!effectsText) return "No notes to analyze.";

  const systemPrompt = "Act as an expert cannabis analyst. Review the user's observed effects and provide a concise, one-sentence summary of the general sentiment (e.g., highly positive, negative, mixed) and the key physical or mental outcomes (e.g., body relaxation, creativity boost, anxiety). Do not use disclaimers.";
  const userQuery = `Analyze the following effects notes: "${effectsText}"`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    tools: [{ "google_search": {} }],
  };

  try {
    const response = await fetchWithBackoff(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis failed.";
    return text.trim();

  } catch (error) {
    console.error('Gemini API Effects Analysis Failed:', error);
    return "AI analysis unavailable due to an API error.";
  }
};

/**
 * Call the Gemini API to suggest a strain name.
 */
const generateStrainName = async (effects, flavor) => {
  if (!effects && !flavor) return "Please provide effects or flavor notes first.";

  const systemPrompt = "Act as a creative cannabis breeder and naming expert. Based on the provided flavor and effects, suggest 3 highly unique, evocative, and culturally relevant strain names. Format the response as a simple comma-separated list.";
  const userQuery = `Flavor profile: ${flavor || 'N/A'}. Observed effects: ${effects || 'N/A'}. Generate 3 names.`;

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
  };

  try {
    const response = await fetchWithBackoff(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Name generation failed.";
    return text.trim();

  } catch (error) {
    console.error('Gemini API Name Generation Failed:', error);
    return "AI naming service unavailable.";
  }
};


// --- Components ---

/**
 * Renders a clickable 1-5 star rating selector.
 */
const StarRating = ({ rating, onRate, size = 'h-6 w-6', readOnly = false }) => {
  return (
    <div className="flex items-center space-x-1">
      {[1, 2, 3, 4, 5].map((starValue) => (
        <Star
          key={starValue}
          className={`transition-colors duration-200 ${size} ${readOnly ? '' : 'cursor-pointer'} ${
            starValue <= rating
              ? 'text-orange-400 fill-orange-400'
              : 'text-gray-500 ' + (readOnly ? '' : 'hover:text-orange-300')
          }`}
          onClick={() => !readOnly && onRate(starValue)}
          aria-label={`${starValue} star rating`}
        />
      ))}
    </div>
  );
};

/**
 * Renders a simple horizontal bar chart.
 */
const BarChart = ({ data, title, colorClass }) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);

  if (total === 0) {
    return (
      <div className="text-center text-gray-500 italic p-4 border border-gray-700 rounded-lg">
        No data logged to display chart.
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      <h4 className="text-lg font-semibold text-gray-300 mb-3">{title}</h4>
      {data.sort((a, b) => b.count - a.count).map((item) => (
        <div key={item.label} className="flex items-center space-x-2">
          <span className="w-1/4 text-sm text-gray-400 truncate">{item.label}</span>
          <div className="flex-grow bg-gray-700 rounded-full h-4">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: `${(item.count / total) * 100}%` }}
            />
          </div>
          <span className="text-sm text-gray-300 font-medium">{item.count}</span>
        </div>
      ))}
    </div>
  );
};


// --- Main Application Component ---

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Strain Data States
  const [reviews, setReviews] = useState([]); // User's private reviews
  const [popularStrains, setPopularStrains] = useState([]); // Public popular strains
  
  // UI States
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState('login'); // 'login', 'signup', 'home', 'log'

  // Form State
  const [form, setForm] = useState({
    strain: '',
    location: '',
    cost: '',
    effects: '',
    rating: 0,
    potency: '', 
    flavor: '',
    brand: '',
    type: 'Hybrid',
    productType: 'Flower',
    terpenes: [], // Array for multi-select
  });
  
  // Auth Form State
  const [authForm, setAuthForm] = useState({
    email: '',
    password: '',
    name: '',
    dob: '', // Date of Birth YYYY-MM-DD
    state: US_STATES[0] || 'Florida',
  });
  
  // LLM States
  const [aiNameLoading, setAiNameLoading] = useState(false);
  const [aiNameSuggestions, setAiNameSuggestions] = useState(null);

  // Filter/Search States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterRating, setFilterRating] = useState(0);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [dashboardSearchTerm, setDashboardSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('Florida');

  // Firestore Paths
  const privateCollectionPath = useMemo(() => {
    if (userId) return `artifacts/${appId}/users/${userId}/strain_reviews`;
    return null;
  }, [userId]);
  
  const publicCollectionPath = useMemo(() => {
      return `artifacts/${appId}/public/data/popular_strains`;
  }, []);

  const userProfilePath = useMemo(() => {
      if (userId) return `artifacts/${appId}/users/${userId}/profile/data`;
      return null;
  }, [userId]);


  // --- 1. Firebase Initialization and Authentication ---
  useEffect(() => {
    if (!firebaseConfig) {
      setError('Firebase configuration is missing.');
      setIsLoading(false);
      return;
    }

    try {
      const app = initializeApp(firebaseConfig);
      const newAuth = getAuth(app);
      const newDb = getFirestore(app);

      setAuth(newAuth);
      setDb(newDb);

      const unsubscribe = onAuthStateChanged(newAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthenticated(true);
          // If we are on login/signup, switch to home
          if (currentPage === 'login' || currentPage === 'signup') {
             setCurrentPage('home');
          }
        } else {
          setUserId(null);
          setIsAuthenticated(false);
          setUserProfile(null);
          // Only show login screen if not authenticated
          if (currentPage !== 'login' && currentPage !== 'signup') {
             setCurrentPage('login');
          }
        }
        setIsAuthReady(true);
        setIsLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('Firebase initialization error:', e);
      setError('Failed to initialize the app.');
      setIsLoading(false);
    }
  }, []);
  
  // --- 2. User Profile Listener ---
  useEffect(() => {
    if (!db || !userProfilePath || !isAuthenticated) return;

    const profileDocRef = doc(db, userProfilePath);

    const unsubscribe = onSnapshot(profileDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            setUserProfile(docSnapshot.data());
        } else {
            // User authenticated but no profile yet (shouldn't happen after signup, but safety check)
            setUserProfile({ name: 'User', state: 'N/A' });
        }
    }, (e) => {
        console.error('Firestore profile snapshot error:', e);
    });

    return () => unsubscribe();
  }, [db, userProfilePath, isAuthenticated]);

  // --- 3. Data Listeners (Reviews & Popular) ---
  useEffect(() => {
    if (!isAuthenticated || !db || !privateCollectionPath) return;

    const reviewsCollectionRef = collection(db, privateCollectionPath);
    const q = query(reviewsCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedReviews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : new Date(),
      })).sort((a, b) => b.timestamp - a.timestamp); 

      setReviews(fetchedReviews);
    }, (e) => {
      console.error('Firestore private snapshot error:', e);
    });

    return () => unsubscribe();
  }, [isAuthenticated, db, privateCollectionPath]);

  useEffect(() => {
      if (!isAuthenticated || !db || !publicCollectionPath) return;

      const popularRef = collection(db, publicCollectionPath);
      const qPopular = query(popularRef);

      const unsubscribe = onSnapshot(qPopular, (snapshot) => {
          const fetchedStrains = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
              .sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate())
              .reduce((acc, current) => {
                  const x = acc.find(item => item.strain === current.strain);
                  if (!x && acc.length < 5) {
                      return acc.concat([current]);
                  }
                  return acc;
              }, []);
          setPopularStrains(fetchedStrains);
      }, (e) => {
          console.error('Firestore public snapshot error:', e);
      });

      return () => unsubscribe();
  }, [isAuthenticated, db, publicCollectionPath]); 


  // --- Filtering and Searching Logic ---
  const filteredReviews = useMemo(() => {
    let currentReviews = reviews;

    // Apply Search Filter
    const currentSearchTerm = currentPage === 'home' ? dashboardSearchTerm : searchTerm;

    if (currentSearchTerm.trim()) {
      const lowerSearchTerm = currentSearchTerm.toLowerCase();
      currentReviews = currentReviews.filter(review =>
        review.strain.toLowerCase().includes(lowerSearchTerm) ||
        (review.effects && review.effects.toLowerCase().includes(lowerSearchTerm)) ||
        (review.terpenes && review.terpenes.some(t => t.toLowerCase().includes(lowerSearchTerm))) || // Search terpenes array
        (review.brand && review.brand.toLowerCase().includes(lowerSearchTerm)) ||
        (review.location && review.location.toLowerCase().includes(lowerSearchTerm))
      );
    }

    // Apply Log Page Filters
    if (currentPage === 'log') {
        if (filterType) {
          currentReviews = currentReviews.filter(review => review.type === filterType);
        }
        if (filterRating > 0) {
          currentReviews = currentReviews.filter(review => review.rating >= filterRating);
        }
        if (filterBrand.trim()) {
          const lowerBrand = filterBrand.toLowerCase();
          currentReviews = currentReviews.filter(review =>
            review.brand && review.brand.toLowerCase() === lowerBrand
          );
        }
        if (filterLocation.trim()) {
          const lowerLocation = filterLocation.toLowerCase();
          currentReviews = currentReviews.filter(review =>
            review.location && review.location.toLowerCase() === lowerLocation
          );
        }
    }
    
    // Sort for Home Page Top Strains (Higher rated first)
    if (currentPage === 'home') {
        return currentReviews
            .filter(r => r.rating >= 4) // Only high-rated
            .sort((a, b) => b.rating - a.rating || b.timestamp - a.timestamp)
            .slice(0, 5); // Limit to top 5
    }

    return currentReviews;
  }, [reviews, searchTerm, dashboardSearchTerm, filterType, filterRating, filterLocation, filterBrand, currentPage]);

  const getProductTypeData = useCallback((reviewList) => {
      const counts = reviewList.reduce((acc, review) => {
          const type = review.productType || 'Unknown';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
      }, {});
      return Object.entries(counts).map(([label, count]) => ({ label, count }));
  }, []);

  const topRatedProductTypeData = useMemo(() => {
    return getProductTypeData(reviews.filter(r => r.rating >= 4));
  }, [reviews, getProductTypeData]);

  const popularProductTypeData = useMemo(() => {
      return getProductTypeData(popularStrains);
  }, [popularStrains, getProductTypeData]);

  // --- Handlers ---

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setAiNameSuggestions(null); // Clear AI suggestions on manual input
  };
  
  const handleTerpeneChange = (e) => {
    const { options } = e.target;
    const selectedTerpenes = [];
    for (let i = 0; i < options.length; i++) {
      if (options[i].selected) {
        selectedTerpenes.push(options[i].value);
      }
    }

    if (selectedTerpenes.length > 3) {
      setError('You can select a maximum of 3 terpenes.');
      // Keep previous state if validation fails
      return; 
    }
    setError(null);
    setForm((prev) => ({ ...prev, terpenes: selectedTerpenes }));
  };

  const handleRatingChange = (newRating) => {
    setForm((prev) => ({ ...prev, rating: newRating }));
  };
  
  const handleAuthChange = (e) => {
      const { name, value } = e.target;
      setAuthForm(prev => ({ ...prev, [name]: value }));
  }
  
  const handleSignOut = async () => {
    if (auth) {
        try {
            await signOut(auth);
            setReviews([]);
            setUserProfile(null);
            setCurrentPage('login');
        } catch (e) {
            console.error('Sign out error:', e);
            setError('Failed to sign out.');
        }
    }
  };
  
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    
    const { email, password, name, dob, state } = authForm;

    // Age Verification (21+)
    const dobDate = new Date(dob);
    const minAgeDate = new Date();
    minAgeDate.setFullYear(minAgeDate.getFullYear() - 21);

    if (dobDate > minAgeDate) {
        setError("You must be 21 years or older to use this application.");
        setIsSaving(false);
        return;
    }

    try {
        // 1. Create User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;
        
        // 2. Create User Profile
        if (db) {
            const profileRef = doc(db, `artifacts/${appId}/users/${uid}/profile/data`);
            await setDoc(profileRef, {
                name: name,
                state: state,
                dob: dob,
                email: email,
                createdAt: Timestamp.now()
            });
        }
        
        setAuthForm({ email: '', password: '', name: '', dob: '', state: US_STATES[0] || 'Florida' });
        setCurrentPage('home'); // Go to dashboard after successful signup

    } catch (e) {
        console.error('Sign up error:', e);
        if (e.code === 'auth/weak-password') {
            setError('Password is too weak. Must be at least 6 characters.');
        } else if (e.code === 'auth/email-already-in-use') {
            setError('This email is already registered. Try logging in.');
        } else {
            setError('Sign up failed. Please check your email and password.');
        }
    } finally {
        setIsSaving(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    
    const { email, password } = authForm;
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        setAuthForm({ ...authForm, password: '' }); // Clear password
        setCurrentPage('home'); // Go to dashboard after successful login
    } catch (e) {
        console.error('Sign in error:', e);
        setError('Login failed. Check your email and password.');
    } finally {
        setIsSaving(false);
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    if (!db || !privateCollectionPath) {
      setError('Database is not ready. Please try again.');
      setIsSaving(false);
      return;
    }

    try {
      const newReview = {
        strain: form.strain.trim(),
        location: form.location.trim(),
        cost: parseFloat(form.cost) || 0, 
        effects: form.effects.trim(),
        rating: form.rating,
        potency: form.potency.trim(),
        flavor: form.flavor.trim(),
        brand: form.brand.trim(),
        type: form.type,
        productType: form.productType,
        terpenes: form.terpenes, // Array of selected terpenes
        timestamp: Timestamp.now(),
        userId: userId, // Link review to user
      };

      if (!newReview.strain || newReview.rating === 0) {
        setError('Strain Name and Rating are required.');
        setIsSaving(false);
        return;
      }
      
      if (newReview.terpenes.length > 3) {
           setError('Cannot log more than 3 terpenes.');
           setIsSaving(false);
           return;
      }

      // 1. Save to Private Log
      await addDoc(collection(db, privateCollectionPath), newReview);
      
      // 2. If high rating, also submit to Public Popular Strains log
      if (newReview.rating >= 4) {
          await addDoc(collection(db, publicCollectionPath), {
              strain: newReview.strain,
              rating: newReview.rating,
              type: newReview.type,
              productType: newReview.productType,
              potency: newReview.potency,
              brand: newReview.brand,
              terpenes: newReview.terpenes,
              addedBy: userId,
              timestamp: Timestamp.now(),
          });
      }

      // Reset form
      setForm({ strain: '', location: '', cost: '', effects: '', rating: 0, potency: '', flavor: '', brand: '', type: 'Hybrid', productType: 'Flower', terpenes: [] });
      setAiNameSuggestions(null);
      setCurrentPage('log'); // Switch to log/history screen after successful submit

    } catch (e) {
      console.error('Error adding document: ', e);
      setError('Failed to save your review.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (reviewId) => {
    if (!db || !privateCollectionPath) {
      setError('Database is not ready.');
      return;
    }

    try {
      await deleteDoc(doc(db, privateCollectionPath, reviewId));
    } catch (e) {
      console.error('Error deleting document: ', e);
      setError('Failed to delete review.');
    }
  };

  const handleShare = (review) => {
    const terpeneString = review.terpenes && review.terpenes.length > 0 ? review.terpenes.join(', ') : 'N/A';
    const textToCopy = `
*** Black Cannabis Lounge Strain Tracker ***
Strain: ${review.strain} (${review.type || 'N/A'} | ${review.productType || 'N/A'})
Rating: ${'⭐'.repeat(review.rating) || 'N/A'}
Potency: ${review.potency || 'N/A'}
Flavor: ${review.flavor || 'N/A'}
Terpenes: ${terpeneString}
Brand: ${review.brand || 'N/A'}
Purchased: ${review.location || 'N/A'} for $${review.cost ? review.cost.toFixed(2) : 'N/A'}
Effects/Notes: ${review.effects || 'None'}
Logged on: ${new Date(review.timestamp).toLocaleDateString()}
    `.trim();

    const textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      setError('Review details copied to clipboard! Ready to share.');
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Could not copy text: ', err);
      setError('Could not copy text. Please copy manually.');
      setTimeout(() => setError(null), 3000);
    }
    document.body.removeChild(textarea);
  };
  
  const handleAiNameSuggest = async () => {
    setAiNameLoading(true);
    setError(null);
    try {
        const names = await generateStrainName(form.effects, form.flavor);
        const nameArray = names.split(',').map(n => n.trim()).filter(n => n.length > 0);
        setAiNameSuggestions(nameArray);
    } catch (e) {
        setError("Failed to generate strain names. Try again later.");
    } finally {
        setAiNameLoading(false);
    }
  };

  const handleAnalyzeEffects = async (reviewId) => {
      const reviewIndex = reviews.findIndex(r => r.id === reviewId);
      if (reviewIndex === -1) return;

      const reviewToUpdate = reviews[reviewIndex];
      if (reviewToUpdate.analysisLoading) return;

      // Optimistically update state to show loading
      setReviews(prevReviews => prevReviews.map(r => 
          r.id === reviewId ? { ...r, analysisLoading: true } : r
      ));

      try {
          const analysis = await analyzeEffects(reviewToUpdate.effects);
          
          // Update the review in Firestore with the new analysis result
          if (db) {
              const reviewRef = doc(db, privateCollectionPath, reviewId);
              await setDoc(reviewRef, { analysis }, { merge: true });
          }

      } catch (e) {
          console.error('Failed to run AI analysis:', e);
          // Revert loading state on error
          setReviews(prevReviews => prevReviews.map(r => 
              r.id === reviewId ? { ...r, analysisLoading: false } : r
          ));
      }
  };


  // --- Render Functions (Screens) ---

  const renderLoginScreen = () => (
      <div className="flex items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-md p-8 bg-gray-800 rounded-xl shadow-2xl border border-fuchsia-900/50">
              <h2 className="text-3xl font-extrabold text-teal-400 text-center mb-6">Welcome to the Lounge</h2>
              <p className="text-gray-400 text-center mb-8">Sign in to access your private strain log.</p>
              
              <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                      <label className="block text-sm font-medium text-gray-300">Email</label>
                      <input
                          type="email"
                          name="email"
                          value={authForm.email}
                          onChange={handleAuthChange}
                          className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                          placeholder="your@email.com"
                          required
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-300">Password</label>
                      <input
                          type="password"
                          name="password"
                          value={authForm.password}
                          onChange={handleAuthChange}
                          className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                          placeholder="********"
                          required
                      />
                  </div>
                  
                  {error && (
                      <p className="text-red-400 bg-red-900/50 p-2 rounded-lg text-sm text-center">{error}</p>
                  )}

                  <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full py-3 mt-4 rounded-lg shadow-md text-lg font-medium text-gray-900 bg-teal-500 hover:bg-teal-600 transition disabled:opacity-50"
                  >
                      {isSaving ? 'Logging In...' : 'Log In'}
                  </button>
              </form>
              
              <p className="mt-6 text-center text-sm text-gray-400">
                  New to the Tracker? 
                  <button 
                      onClick={() => setCurrentPage('signup')}
                      className="text-orange-400 hover:text-orange-300 font-semibold ml-1 transition"
                  >
                      Create an Account
                  </button>
              </p>
          </div>
      </div>
  );

  const renderSignUpScreen = () => (
      <div className="flex items-center justify-center min-h-screen p-4">
          <div className="w-full max-w-lg p-8 bg-gray-800 rounded-xl shadow-2xl border border-fuchsia-900/50">
              <h2 className="text-3xl font-extrabold text-teal-400 text-center mb-6">Create Your Tracker Account</h2>
              
              <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-300 flex items-center"><User className="h-4 w-4 mr-1"/> Full Name</label>
                          <input type="text" name="name" value={authForm.name} onChange={handleAuthChange} className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3" required />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-300 flex items-center"><Calendar className="h-4 w-4 mr-1"/> Date of Birth (21+)</label>
                          <input type="date" name="dob" value={authForm.dob} onChange={handleAuthChange} className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3" required />
                      </div>
                  </div>
                  
                  <div>
                      <label className="block text-sm font-medium text-gray-300 flex items-center"><MapPin className="h-4 w-4 mr-1"/> State</label>
                      <select name="state" value={authForm.state} onChange={handleAuthChange} className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 appearance-none" required>
                          {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
                      </select>
                  </div>

                  <div>
                      <label className="block text-sm font-medium text-gray-300">Email</label>
                      <input type="email" name="email" value={authForm.email} onChange={handleAuthChange} className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3" placeholder="your@email.com" required />
                  </div>
                  
                  <div>
                      <label className="block text-sm font-medium text-gray-300">Password</label>
                      <input type="password" name="password" value={authForm.password} onChange={handleAuthChange} className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3" placeholder="Min 6 characters" required />
                  </div>
                  
                  {error && (
                      <p className="text-red-400 bg-red-900/50 p-2 rounded-lg text-sm text-center">{error}</p>
                  )}

                  <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full py-3 mt-4 rounded-lg shadow-md text-lg font-medium text-gray-900 bg-orange-500 hover:bg-orange-600 transition disabled:opacity-50"
                  >
                      {isSaving ? 'Signing Up...' : 'Create Account'}
                  </button>
              </form>
              
              <p className="mt-6 text-center text-sm text-gray-400">
                  Already have an account? 
                  <button 
                      onClick={() => setCurrentPage('login')}
                      className="text-teal-400 hover:text-teal-300 font-semibold ml-1 transition"
                  >
                      Log In
                  </button>
              </p>
          </div>
      </div>
  );

  const renderHomeDashboard = () => {
    const legalityInfo = US_CANNABIS_LEGALITY[selectedState] || { status: 'Unknown', color: 'bg-gray-700', text: 'text-gray-400' };

    return (
      <div className="space-y-8">
        {/* Welcome and Actions */}
        <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
          <h2 className="text-3xl font-bold text-teal-400 mb-2">
            Welcome back, {userProfile?.name || 'User'}!
          </h2>
          <p className="text-gray-400 text-lg mb-6">
            Time to log a new experience or check your favorites.
          </p>
          <button
            onClick={() => setCurrentPage('log')}
            className="w-full sm:w-auto py-3 px-6 border-2 border-orange-500 rounded-lg shadow-lg text-lg font-medium text-gray-900 bg-orange-500 hover:bg-orange-600 transition duration-150 ease-in-out flex items-center justify-center"
          >
            <Hash className="h-6 w-6 mr-2" /> Log New Strain
          </button>
        </section>

        {/* State Legality Lookup */}
        <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
          <h3 className="text-xl font-semibold text-teal-400 mb-4 flex items-center">
            <MapPin className="h-5 w-5 mr-2" /> US Cannabis Legality Lookup
          </h3>
          <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 items-end">
            <div className="flex-grow w-full sm:w-1/2">
              <label htmlFor="stateSelect" className="block text-sm font-medium text-gray-300">Select State</label>
              <select
                id="stateSelect"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500 appearance-none"
              >
                {US_STATES.map(state => <option key={state} value={state}>{state}</option>)}
              </select>
            </div>
            <div className={`w-full sm:w-1/2 p-3 rounded-lg text-center font-bold ${legalityInfo.color} ${legalityInfo.text}`}>
              {selectedState}: {legalityInfo.status}
            </div>
          </div>
        </section>

        {/* Dashboard Search */}
        <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
            <h3 className="text-xl font-semibold text-teal-400 mb-4 flex items-center">
                <Search className="h-5 w-5 mr-2" /> Quick Search Your Log
            </h3>
            <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search your strains (Name, Effects, Brand)..."
                    value={dashboardSearchTerm}
                    onChange={(e) => setDashboardSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-lg bg-gray-700 border border-fuchsia-700 text-white focus:ring-orange-500 focus:border-orange-500"
                />
            </div>

            {/* Display Search Results on Home Screen if search is active */}
            {dashboardSearchTerm.trim() && (
                <div className="mt-4 border-t border-gray-700 pt-4">
                    <h4 className="text-lg font-semibold text-gray-300 mb-3">Search Results ({filteredReviews.length})</h4>
                    {filteredReviews.length > 0 ? (
                        filteredReviews.map(r => (
                            <div key={r.id} className="p-3 mb-2 bg-gray-700 rounded-lg flex justify-between items-center">
                                <span className="font-semibold text-teal-300">{r.strain}</span>
                                <StarRating rating={r.rating} readOnly={true} size='h-5 w-5' />
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No matching strains found in your log.</p>
                    )}
                </div>
            )}
        </section>

        {/* Top Rated Strains (from user's private log) */}
        <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
            <h3 className="text-xl font-semibold text-teal-400 mb-4">
                Your Top Rated Strains ({reviews.filter(r => r.rating >= 4).length})
            </h3>
            <BarChart 
                data={topRatedProductTypeData} 
                title="Product Type Breakdown (Your Top Strains)" 
                colorClass="bg-orange-500"
            />
            <div className="space-y-3 mt-4">
                {reviews.filter(r => r.rating >= 4).length === 0 ? (
                    <p className="text-gray-500">Log a few 4 or 5-star strains to see your favorites here!</p>
                ) : (
                    filteredReviews.map(r => (
                        <div key={r.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="font-semibold text-gray-200">{r.strain} <span className="text-sm text-gray-400">({r.productType})</span></span>
                                <span className="text-xs text-gray-500">{r.brand || 'No Brand'}</span>
                            </div>
                            <StarRating rating={r.rating} readOnly={true} size='h-5 w-5' />
                        </div>
                    ))
                )}
            </div>
        </section>

        {/* Popular Strains (from public log) */}
        <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
            <h3 className="text-xl font-semibold text-teal-400 mb-4">
                Community Popular Strains
            </h3>
            <BarChart 
                data={popularProductTypeData} 
                title="Product Type Breakdown (Community Faves)" 
                colorClass="bg-teal-500"
            />
            <div className="space-y-3 mt-4">
                {popularStrains.length === 0 ? (
                    <p className="text-gray-500">No popular strains shared by the community yet.</p>
                ) : (
                    popularStrains.map(s => (
                        <div key={s.id} className="p-3 bg-gray-700 rounded-lg flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="font-semibold text-gray-200">{s.strain} <span className="text-sm text-gray-400">({s.type})</span></span>
                                <span className="text-xs text-gray-500">{s.brand || 'N/A'}</span>
                            </div>
                            <StarRating rating={s.rating} readOnly={true} size='h-5 w-5' />
                        </div>
                    ))
                )}
            </div>
        </section>
      </div>
    );
  };

  const renderReviewLogScreen = () => (
    <div className="space-y-8">
      {/* New Review Form */}
      <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
        <h2 className="text-2xl font-semibold mb-6 text-teal-400 border-b border-gray-700 pb-3">
          Log New Strain
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Strain and Product Type */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="strain" className="block text-sm font-medium text-gray-300 flex items-center">Strain Name *</label>
              <div className="flex mt-1">
                <input
                  type="text"
                  name="strain"
                  id="strain"
                  value={form.strain}
                  onChange={handleFormChange}
                  className="block w-full rounded-l-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="e.g., OG Kush, Blue Dream"
                  required
                />
                 <button
                    type="button"
                    onClick={handleAiNameSuggest}
                    disabled={aiNameLoading || (!form.effects && !form.flavor)}
                    className="flex-shrink-0 p-3 bg-fuchsia-700 text-white rounded-r-lg hover:bg-fuchsia-600 transition disabled:opacity-50"
                    title="Suggest Strain Name based on notes"
                 >
                     <Sparkles className="h-5 w-5" />
                 </button>
              </div>
              {aiNameLoading && <p className="text-xs text-fuchsia-300 mt-1">AI brainstorming names...</p>}
              {aiNameSuggestions && (
                  <div className="mt-2 p-2 bg-gray-700 rounded-lg text-sm">
                      <p className="font-semibold text-teal-300 mb-1">Suggestions:</p>
                      <div className="flex flex-wrap gap-2">
                        {aiNameSuggestions.map((name, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => setForm(p => ({ ...p, strain: name }))}
                            className="bg-gray-600 text-gray-200 hover:bg-gray-500 px-2 py-1 rounded-full text-xs transition"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                  </div>
              )}
            </div>
            <div>
              <label htmlFor="productType" className="block text-sm font-medium text-gray-300">Product Type *</label>
              <select
                name="productType"
                id="productType"
                value={form.productType}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500 appearance-none"
              >
                {productTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          
          {/* Row 2: Brand, Type, Potency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="brand" className="block text-sm font-medium text-gray-300">Brand / Cultivator</label>
              <input
                type="text"
                name="brand"
                id="brand"
                value={form.brand}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., Rythm, Cookies"
              />
            </div>
            <div>
              <label htmlFor="type" className="block text-sm font-medium text-gray-300">Strain Type</label>
              <select
                name="type"
                id="type"
                value={form.type}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500 appearance-none"
              >
                {strainTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="potency" className="block text-sm font-medium text-gray-300">Potency (THC/CBD %)</label>
              <input
                type="text"
                name="potency"
                id="potency"
                value={form.potency}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., 28% THC"
              />
            </div>
          </div>

          {/* Row 3: Flavor, Terpenes, Rating */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="flavor" className="block text-sm font-medium text-gray-300">Flavor Profile</label>
              <input
                type="text"
                name="flavor"
                id="flavor"
                value={form.flavor}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., Citrus, Pine, Skunk"
              />
            </div>
            <div>
              <label htmlFor="terpenes" className="block text-sm font-medium text-gray-300">Key Terpenes (Select Top 3)</label>
              <select
                  multiple
                  name="terpenes"
                  id="terpenes"
                  value={form.terpenes}
                  onChange={handleTerpeneChange}
                  className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500 h-28"
                  size="5"
              >
                  {TOP_TERPENES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Your Rating *</label>
              <StarRating rating={form.rating} onRate={handleRatingChange} />
            </div>
          </div>
          
          {/* Row 4: Location and Cost */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-300">Purchased From (Location)</label>
              <input
                type="text"
                name="location"
                id="location"
                value={form.location}
                onChange={handleFormChange}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., Local Dispensary Name"
              />
            </div>
            <div>
              <label htmlFor="cost" className="block text-sm font-medium text-gray-300">Cost (USD)</label>
              <input
                type="number"
                name="cost"
                id="cost"
                value={form.cost}
                onChange={handleFormChange}
                min="0"
                step="0.01"
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., 55.00"
              />
            </div>
          </div>


          {/* Row 5: Effects Description */}
          <div>
            <label htmlFor="effects" className="block text-sm font-medium text-gray-300">Observed Effects / Notes</label>
            <textarea
              name="effects"
              id="effects"
              rows="3"
              value={form.effects}
              onChange={handleFormChange}
              className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 focus:ring-orange-500 focus:border-orange-500"
              placeholder="e.g., Very relaxing, helped with sleep, slightly dry mouth..."
            ></textarea>
          </div>

          {error && (
            <p className="text-red-400 bg-red-900/50 p-2 rounded-lg text-sm text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || form.rating === 0 || form.strain.trim() === ''}
            className="w-full py-3 px-4 border-2 border-orange-500 rounded-lg shadow-sm text-lg font-medium text-gray-900 bg-orange-500 hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Add Review'}
          </button>
        </form>
      </section>
      
      {/* --- Search and Filter Section --- */}
      <section className="bg-gray-900/70 p-6 rounded-xl shadow-2xl border border-fuchsia-900/50">
        <h2 className="text-2xl font-semibold mb-6 text-teal-400 border-b border-gray-700 pb-3">
          Filter Your History
        </h2>
        
        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Strain, Effects, Terpenes, Brand, or Location..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-lg bg-gray-700 border border-fuchsia-700 text-white focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        {/* Filter Options */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          
          {/* Filter by Type */}
          <div>
            <label htmlFor="filterType" className="block text-sm font-medium text-gray-300">Strain Type</label>
            <select
              id="filterType"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 text-sm focus:ring-orange-500 focus:border-orange-500 appearance-none"
            >
              <option value="">All Types</option>
              {strainTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          
          {/* Filter by Min Rating */}
          <div>
            <label htmlFor="filterRating" className="block text-sm font-medium text-gray-300">Min. Rating</label>
            <select
              id="filterRating"
              value={filterRating}
              onChange={(e) => setFilterRating(parseInt(e.target.value))}
              className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 text-sm focus:ring-orange-500 focus:border-orange-500 appearance-none"
            >
              <option value={0}>All Ratings</option>
              {[1, 2, 3, 4, 5].map(r => <option key={r} value={r}>{r} Stars +</option>)}
            </select>
          </div>
          
           {/* Filter by Brand (Text input for easier use) */}
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="filterBrand" className="block text-sm font-medium text-gray-300">Brand</label>
            <input
                type="text"
                id="filterBrand"
                value={filterBrand}
                onChange={(e) => setFilterBrand(e.target.value)}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 text-sm focus:ring-orange-500 focus:border-orange-500"
                placeholder="Exact Brand Name"
            />
          </div>

          {/* Filter by Location (Text input) */}
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="filterLocation" className="block text-sm font-medium text-gray-300">Location</label>
            <input
                type="text"
                id="filterLocation"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="mt-1 block w-full rounded-lg bg-gray-700 border border-gray-600 text-white p-3 text-sm focus:ring-orange-500 focus:border-orange-500"
                placeholder="Exact Location Name"
            />
          </div>
          
        </div>
      </section>


      {/* --- Review List --- */}
      <section>
        <h2 className="text-2xl font-semibold mb-6 text-teal-400 border-b border-gray-700 pb-3">
          Review History ({filteredReviews.length} / {reviews.length})
        </h2>

        <div className="space-y-4">
          {filteredReviews.length === 0 ? (
            <div className="text-center py-10 text-gray-500 bg-gray-900/70 rounded-xl border border-fuchsia-900/50">
              {reviews.length === 0 
                ? 'No reviews logged yet. Get tracking!'
                : 'No results found matching your search and filter criteria.'
              }
            </div>
          ) : (
            filteredReviews.map((review) => (
              <div key={review.id} className="bg-gray-900/70 p-5 rounded-xl shadow-lg border border-fuchsia-900/50 flex flex-col justify-between">
                {/* Review Header and Rating */}
                <div className="flex justify-between items-start mb-3 border-b border-gray-700 pb-3">
                  <div className="flex-grow">
                      <h3 className="text-2xl font-bold text-teal-400">
                        {review.strain} 
                        <span className="text-base font-medium ml-2 text-gray-400">({review.type})</span>
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">{review.brand || 'No Brand Listed'}</p>
                  </div>
                  <div className="flex-shrink-0">
                     <StarRating rating={review.rating} readOnly={true} size='h-6 w-6'/>
                  </div>
                </div>

                {/* Key Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 text-sm mb-4">
                   <p className="text-gray-400"><span className="font-semibold text-gray-300">Product:</span> {review.productType || 'N/A'}</p>
                   <p className="text-gray-400"><span className="font-semibold text-gray-300">Potency:</span> {review.potency || 'N/A'}</p>
                   <p className="text-gray-400"><span className="font-semibold text-gray-300">Flavor:</span> {review.flavor || 'N/A'}</p>
                   <p className="text-gray-400"><span className="font-semibold text-gray-300">Terpenes:</span> {review.terpenes && review.terpenes.length > 0 ? review.terpenes.join(', ') : 'N/A'}</p>
                   <p className="text-gray-400 col-span-2"><span className="font-semibold text-gray-300">Purchased:</span> {review.location || 'N/A'}</p>
                   <p className="text-gray-400 col-span-2"><span className="font-semibold text-gray-300">Cost:</span> {review.cost > 0 ? `$${review.cost.toFixed(2)}` : 'N/A'}</p>
                </div>

                {/* Effects/Notes */}
                <div className="bg-gray-800 p-3 rounded-lg">
                  <p className="text-gray-300 whitespace-pre-wrap">
                    <span className="font-semibold text-gray-300 block mb-1 text-sm">Effects/Notes:</span>
                    {review.effects || <span className="text-gray-500 italic">No detailed notes recorded.</span>}
                  </p>
                </div>
                
                {/* AI Analysis Section */}
                <div className="mt-3">
                    {review.analysis ? (
                        <div className="bg-fuchsia-900/30 text-fuchsia-300 p-3 rounded-lg text-sm italic border border-fuchsia-700/50">
                            <Sparkles className="h-4 w-4 inline mr-2"/> **AI Summary:** {review.analysis}
                        </div>
                    ) : (
                        <button
                            onClick={() => handleAnalyzeEffects(review.id)}
                            disabled={review.analysisLoading || !review.effects}
                            className="text-fuchsia-400 hover:text-fuchsia-300 transition-colors duration-150 p-1 rounded-full hover:bg-gray-800 flex items-center text-sm disabled:opacity-50"
                            title="Generate AI Summary of Effects"
                        >
                            {review.analysisLoading ? (
                                <>
                                    <Sparkles className="h-4 w-4 mr-1 animate-spin" /> Analyzing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-1" /> AI Analyze Effects
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Actions & Timestamp */}
                <div className="mt-4 flex justify-between items-center border-t border-gray-700 pt-3">
                  <p className="text-xs text-gray-500">
                    Logged: {new Date(review.timestamp).toLocaleDateString()}
                  </p>
                  <div className="flex space-x-2">
                       <button
                         onClick={() => handleShare(review)}
                         className="text-teal-400 hover:text-teal-500 transition-colors duration-150 p-1 rounded-full hover:bg-gray-800 flex items-center"
                         aria-label="Share Review"
                         title="Copy review to clipboard"
                       >
                         <Share2 className="h-5 w-5 mr-1" /> Share
                       </button>
                       <button
                         onClick={() => handleDelete(review.id)}
                         className="text-red-400 hover:text-red-500 transition-colors duration-150 p-1 rounded-full hover:bg-gray-800"
                         aria-label="Delete Review"
                         title="Delete Review"
                       >
                         <Trash2 className="h-5 w-5" />
                       </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
  
  // --- Main Render ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-teal-400">
        <div className="text-xl">Firing up the Tracker...</div>
      </div>
    );
  }
  
  // Render Auth Screens if not authenticated
  if (!isAuthenticated) {
      if (currentPage === 'signup') return renderSignUpScreen();
      return renderLoginScreen(); // Default to login if not authenticated
  }

  // Render App if authenticated
  return (
    <div className="min-h-screen p-4 sm:p-8 font-sans bg-gradient-to-br from-gray-900 via-gray-900 to-fuchsia-900/30">
      <div className="max-w-4xl mx-auto">
        
        {/* Global Header */}
        <header className="text-center mb-6">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-xl font-extrabold text-teal-400 tracking-tight sm:text-2xl">
              Black Cannabis Lounge
            </h1>
            <button
               onClick={handleSignOut}
               className="text-sm font-semibold text-orange-400 hover:text-orange-300 transition-colors duration-150 flex items-center bg-gray-800 p-2 rounded-lg"
            >
               <Send className="h-4 w-4 mr-1 rotate-180"/> Log Out
            </button>
          </div>
          <p className="mt-1 text-gray-400 text-lg">
            Strain Tracker for the Community
          </p>
        </header>
        
        {/* Navigation Bar */}
        <nav className="grid grid-cols-3 gap-3 mb-8 border-b-2 border-fuchsia-700/50 pb-4">
            <button
                onClick={() => { setCurrentPage('home'); setSearchTerm(''); setDashboardSearchTerm(''); }}
                className={`py-2 px-1 sm:px-4 rounded-lg font-semibold transition-colors duration-150 flex items-center justify-center text-sm sm:text-base ${
                    currentPage === 'home' ? 'bg-fuchsia-700 text-white shadow-lg' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
            >
                <Home className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
                onClick={() => { setCurrentPage('log'); setSearchTerm(''); setDashboardSearchTerm(''); }}
                className={`py-2 px-1 sm:px-4 rounded-lg font-semibold transition-colors duration-150 flex items-center justify-center text-sm sm:text-base ${
                    currentPage === 'log' ? 'bg-fuchsia-700 text-white shadow-lg' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
            >
                <Hash className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Log & History</span>
            </button>
            <a
                href="https://www.facebook.com/groups/652135626538111"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-1 sm:px-4 rounded-lg font-semibold transition-colors duration-150 flex items-center justify-center text-sm sm:text-base bg-orange-500 text-gray-900 hover:bg-orange-600 shadow-lg"
            >
                <Zap className="h-5 w-5 mr-0 sm:mr-2" /> <span className="hidden sm:inline">Enter the Lounge</span>
            </a>
        </nav>
        
        {/* Page Content */}
        {currentPage === 'home' && renderHomeDashboard()}
        {currentPage === 'log' && renderReviewLogScreen()}
        
      </div>
    </div>
  );
};

export default App;
