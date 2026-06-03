import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc,
  updateDoc,
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  writeBatch,
  getDocs,
  where,
  getDoc,
  limit as firestoreLimit
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { handleFirestoreError, OperationType } from '../firestoreUtils';
import ConfirmationDialog from './ConfirmationDialog';
import { 
  Plus, 
  Trash2, 
  MessageSquare, 
  X, 
  Search, 
  LayoutGrid, 
  List as ListIcon,
  Smartphone,
  Mail,
  MessageCircle,
  Activity,
  Edit3,
  Copy,
  AlertTriangle,
  Download,
  Upload,
  CheckSquare,
  Square,
  Check,
  Send
} from 'lucide-react';

interface Template {
  id: string;
  name: string;  // unique identifier for the template
  channel: 'sms' | 'whatsapp' | 'email' | 'push';
  language: string;
  subject?: string;
  fromEmail?: string;
  body: string;
  components?: Array<{
    type: string;
    text?: string;
  }>;
  messageType: 'transactional' | 'promotional';
  createdAt: any;
}

type TemplateComponent = {
  type: string;
  text?: string;
};

const normalizeTemplateComponents = (components: unknown): TemplateComponent[] => {
  if (!Array.isArray(components)) return [];

  return components
    .filter((component): component is TemplateComponent => Boolean(component) && typeof component === 'object')
    .map((component: any) => ({
      type: String(component.type ?? '').trim(),
      text: typeof component.text === 'string' ? component.text.trim() : '',
    }))
    .filter((component) => component.type);
};

const buildTemplatePayload = ({
  name,
  language,
  subject,
  fromEmail,
  body,
  channel,
  messageType,
  components,
}: {
  name: string;
  language: string;
  subject: string;
  fromEmail: string;
  body: string;
  channel: Template['channel'];
  messageType: Template['messageType'];
  components: TemplateComponent[];
}) => {
  const trimmedBody = body.trim();
  const normalizedComponents = normalizeTemplateComponents(components);
  const templateData: {
    name: string;
    language: string;
    subject: string;
    fromEmail?: string;
    body: string;
    channel: Template['channel'];
    messageType: Template['messageType'];
    components?: TemplateComponent[];
  } = {
    name: name.trim(),
    language: language.trim(),
    subject: subject.trim(),
    ...(channel === 'email' && fromEmail.trim() ? { fromEmail: fromEmail.trim() } : {}),
    body: trimmedBody,
    channel,
    messageType,
  };

  if (channel === 'whatsapp') {
    const nextComponents = normalizedComponents.length > 0
      ? normalizedComponents.map((component) => (
          component.type === 'body'
            ? { ...component, text: trimmedBody }
            : component
        ))
      : [{ type: 'body', text: trimmedBody }];

    if (!nextComponents.some((component) => component.type === 'body')) {
      nextComponents.unshift({ type: 'body', text: trimmedBody });
    }

    templateData.components = nextComponents;
  }

  return templateData;
};

const emailSenderOptions = [
  {
    label: 'No Reply',
    email: 'no-reply@orbifinancial.com',
    description: 'Automated receipts, OTPs, system notices, and non-reply lifecycle emails.',
    value: 'ORBI Financial <no-reply@orbifinancial.com>',
  },
  {
    label: 'Support',
    email: 'support@orbifinancial.com',
    description: 'Customer-care cases, ticket updates, service notices, and helpdesk replies.',
    value: 'ORBI Support <support@orbifinancial.com>',
  },
  {
    label: 'Sales',
    email: 'sales@orbifinancial.com',
    description: 'Merchant onboarding, commercial follow-ups, and approved growth campaigns.',
    value: 'ORBI Sales <sales@orbifinancial.com>',
  },
  {
    label: 'Security',
    email: 'security@orbifinancial.com',
    description: 'Security alerts, suspicious activity notices, and account-protection messages.',
    value: 'ORBI Security <security@orbifinancial.com>',
  },
  {
    label: 'Admin',
    email: 'admin@orbifinancial.com',
    description: 'Platform administration, staff notices, and institutional operations messages.',
    value: 'ORBI Admin <admin@orbifinancial.com>',
  },
  {
    label: 'Info',
    email: 'info@orbifinancial.com',
    description: 'General announcements, informational notices, and standard service updates.',
    value: 'ORBI Info <info@orbifinancial.com>',
  },
];

export default function TemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Form State
  const [newName, setNewName] = useState('');
  const [newLanguage, setNewLanguage] = useState('en');
  const [newSubject, setNewSubject] = useState('');
  const [newFromEmail, setNewFromEmail] = useState(emailSenderOptions[0].value);
  const [newBody, setNewBody] = useState('');
  const [newChannel, setNewChannel] = useState<'sms' | 'whatsapp' | 'email' | 'push'>('sms');
  const [newMessageType, setNewMessageType] = useState<'transactional' | 'promotional'>('transactional');
  const [newComponents, setNewComponents] = useState<TemplateComponent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isSeedConfirmOpen, setIsSeedConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Status/Feedback State
  const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isSeedingSamples, setIsSeedingSamples] = useState(false);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  // Import State
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filteredTemplates = templates.filter(t => 
    (t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.body || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTemplates.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = async () => {
    if (!db || selectedIds.size === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!db || selectedIds.size === 0) return;
    
    setIsBulkDeleting(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, 'message_templates', id));
      });
      await batch.commit();
      setSelectedIds(new Set());
      setIsBulkDeleteModalOpen(false);
      setFeedback({ message: `Successfully deleted ${selectedIds.size} templates`, type: 'success' });
    } catch (error) {
      console.error("Error bulk deleting:", error);
      setFeedback({ message: "Failed to delete templates", type: 'error' });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleExport = () => {
    const dataToExport = templates
      .filter(t => selectedIds.size === 0 || selectedIds.has(t.id))
      .map(({ id, createdAt, ...template }) => ({
        name: template.name,
        language: template.language,
        subject: template.subject || '',
        body: template.body,
        channel: template.channel,
        messageType: template.messageType,
      }));
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `templates_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db || !auth?.currentUser) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedData = JSON.parse(event.target?.result as string);
        const templatesToImport = Array.isArray(importedData) ? importedData : [importedData];

        const token = await auth.currentUser.getIdToken();
        const response = await fetch('/api/templates/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            templates: templatesToImport,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Failed to import templates');
        }

        setFeedback({ message: `Successfully imported ${templatesToImport.length} templates!`, type: 'success' });
      } catch (error: any) {
        console.error("Error importing templates:", error);
        setFeedback({ message: error?.message || "Failed to import templates.", type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  useEffect(() => {
    if (!db || !auth.currentUser) return;

    const setupTemplatesListener = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser!.uid));
        const isAdmin = (userDoc.exists() && userDoc.data().role === 'admin') || 
                        (auth.currentUser?.email === 'auth.fynix@gmail.com' && auth.currentUser?.emailVerified === true);

        const q = isAdmin
          ? query(collection(db, 'message_templates'), orderBy('createdAt', 'desc'))
          : query(
              collection(db, 'message_templates'),
              where('createdBy', '==', auth.currentUser!.uid),
              orderBy('createdAt', 'desc'),
            );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          const docs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Template[];
          setTemplates(docs);
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'message_templates');
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error setting up templates listener:", error);
        setLoading(false);
      }
    };

    let unsubscribe: (() => void) | undefined;
    setupTemplatesListener().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [auth.currentUser]);

  const handleSeedSample = async () => {
    if (!db || !auth?.currentUser) return;
    
    const samples = [
      {
        name: "OTP_Message",
        language: "sw",
        body: "ORB Financial: Ndugu mteja, namba yako ya siri ya muda (OTP) ni {{otp}}. Usitoe namba hii kwa mtu yeyote.",
        channel: "sms",
        messageType: "transactional"
      },
      {
        name: "TRANSFER_ALERT",
        language: "sw",
        body: "ORB Financial: Umefanikiwa kutuma {{currency}} {{amount}} kwenda kwa {{recipient}} tarehe {{date}}. Ref: {{refId}}",
        channel: "sms",
        messageType: "transactional"
      },
      {
        name: "MONTHLY_STMT",
        language: "en",
        subject: "Your Monthly Statement",
        body: "Dear {{name}}, your monthly statement for {{month}} is now available. View it here: {{link}}",
        channel: "email",
        messageType: "promotional"
      },
      {
        name: "LOW_BALANCE",
        language: "sw",
        body: "Habari {{name}}, salio la akaunti yako ni chini ya {{threshold}}. Tafadhali ongeza salio kuendelea kufurahia huduma zetu.",
        channel: "push",
        messageType: "transactional"
      }
    ];

    setIsSeedingSamples(true);
    try {
      const batch = writeBatch(db);
      samples.forEach(sample => {
        const newDocRef = doc(collection(db, 'message_templates'));
        batch.set(newDocRef, {
          ...sample,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();
      setIsSeedConfirmOpen(false);
      setFeedback({ message: "Successfully seeded sample templates!", type: 'success' });
    } catch (error) {
      console.error("Error seeding samples:", error);
      setFeedback({ message: "Failed to seed samples", type: 'error' });
    } finally {
      setIsSeedingSamples(false);
    }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth?.currentUser || !db) return;

    setIsSubmitting(true);
    try {
      const templateData = buildTemplatePayload({
        name: newName,
        language: newLanguage,
        subject: newSubject,
        fromEmail: newFromEmail,
        body: newBody,
        channel: newChannel,
        messageType: newMessageType,
        components: newComponents,
      });

      if (editingTemplateId) {
        await updateDoc(doc(db, 'message_templates', editingTemplateId), templateData);
      } else {
        await addDoc(collection(db, 'message_templates'), {
          ...templateData,
          createdBy: auth.currentUser.uid,
          createdAt: serverTimestamp()
        });
      }
      
      resetForm();
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving template:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewLanguage('en');
    setNewSubject('');
    setNewFromEmail(emailSenderOptions[0].value);
    setNewBody('');
    setNewChannel('sms');
    setNewMessageType('transactional');
    setNewComponents([]);
    setEditingTemplateId(null);
  };

  const handleEditClick = (template: Template) => {
    setNewName(template.name);
    setNewLanguage(template.language);
    setNewSubject(template.subject || '');
    setNewFromEmail(template.fromEmail || emailSenderOptions[0].value);
    setNewBody(template.body);
    setNewChannel(template.channel);
    setNewMessageType(template.messageType);
    setNewComponents(normalizeTemplateComponents(template.components));
    setEditingTemplateId(template.id);
    setIsModalOpen(true);
  };

  const handleDuplicateClick = (template: Template) => {
    setNewName(`${template.name}_copy`);
    setNewLanguage(template.language);
    setNewSubject(template.subject || '');
    setNewFromEmail(template.fromEmail || emailSenderOptions[0].value);
    setNewBody(template.body);
    setNewChannel(template.channel);
    setNewMessageType(template.messageType);
    setNewComponents(normalizeTemplateComponents(template.components));
    setEditingTemplateId(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (template: Template) => {
    setTemplateToDelete(template);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!db || !templateToDelete) return;
    try {
      await deleteDoc(doc(db, 'message_templates', templateToDelete.id));
      setIsDeleteModalOpen(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  const handleSendTest = async (template: Template) => {
    if (!db || !auth?.currentUser) return;
    
    try {
      // Find an active device to "assign" it to, or leave it pending
      const devicesSnap = await getDocs(query(collection(db, 'devices'), firestoreLimit(1)));
      const deviceId = devicesSnap.docs[0]?.id || 'simulated_device';

      await addDoc(collection(db, 'message_logs'), {
        templateName: template.name,
        recipient: "+255 700 000 000",
        body: template.body.replace('{{otp}}', '123456').replace('{{amount}}', '50,000'),
        status: 'sent', // Mark as sent for dashboard visibility
        channel: template.channel,
        createdBy: auth.currentUser.uid,
        timestamp: serverTimestamp()
      });
      
      setFeedback({ message: `Test message sent successfully!`, type: 'success' });
    } catch (error) {
      console.error("Error sending test message:", error);
      setFeedback({ message: "Failed to send test message", type: 'error' });
    }
  };

  const getTypeIcon = (type: string, size = "w-4 h-4") => {
    switch (type) {
      case 'sms': return <Smartphone className={`${size} text-blue-600`} />;
      case 'whatsapp': return <MessageCircle className={`${size} text-emerald-600`} />;
      case 'email': return <Mail className={`${size} text-indigo-600`} />;
      case 'push': return <Activity className={`${size} text-orange-600`} />;
      default: return <MessageSquare className={`${size} text-slate-600`} />;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-bottom duration-300 flex items-center gap-3 border ${
          feedback.type === 'success' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-red-600 border-red-500 text-white'
        }`}>
          {feedback.type === 'success' ? <Check className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="font-bold text-sm">{feedback.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Message Templates</h1>
          <p className="text-slate-500 text-sm font-medium">Create and manage your communication presets.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-2xl font-bold transition-all border border-slate-200 active:scale-95"
            title="Import Templates"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-2xl font-bold transition-all border border-slate-200 active:scale-95"
            title="Export Templates"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => setIsSeedConfirmOpen(true)}
            className="flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2.5 rounded-2xl font-bold transition-all border border-indigo-100 active:scale-95"
            title="Seed Sample Templates"
          >
            <Activity className="w-4 h-4" />
            <span className="hidden sm:inline">Seed Samples</span>
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New Template
          </button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-600 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold">{selectedIds.size} templates selected</span>
            <div className="h-4 w-px bg-white/20" />
            <button 
              onClick={toggleSelectAll}
              className="text-xs font-bold hover:underline"
            >
              {selectedIds.size === filteredTemplates.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export Selected
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isBulkDeleting ? 'Deleting...' : 'Delete Selected'}
            </button>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={isSeedConfirmOpen}
        title="Seed sample templates?"
        message="This will insert a starter set of ORBI sample templates into your workspace so the team can test flows and preview messaging formats quickly."
        confirmLabel="Seed Samples"
        cancelLabel="Not now"
        onConfirm={handleSeedSample}
        onCancel={() => setIsSeedConfirmOpen(false)}
        isProcessing={isSeedingSamples}
        tone="primary"
        effects={[
          'Adds 4 sample templates covering SMS, email, and push channels.',
          'Creates new template records under your current account ownership.',
          'Does not remove or overwrite your existing templates.',
        ]}
      />

      {/* Controls Section */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between enterprise-card p-3 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="templateSearch"
            name="templateSearch"
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button
            onClick={toggleSelectAll}
            className={`p-2 rounded-lg transition-all ${selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0 ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            title="Select All"
          >
            {selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Templates Display */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="text-center py-20 enterprise-card border-dashed border-slate-300">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="w-8 h-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No templates found</h3>
          <p className="text-slate-500 text-sm max-w-xs mx-auto mt-1">
            {searchQuery ? "Try adjusting your search terms." : "Start by creating your first message template."}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <div 
              key={template.id} 
              onClick={() => toggleSelect(template.id)}
              className={`group enterprise-card p-6 hover:shadow-2xl hover:shadow-indigo-100/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden cursor-pointer ${
                selectedIds.has(template.id) ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-200'
              }`}
            >
              {selectedIds.has(template.id) && (
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500" />
              )}
              <div className="absolute top-4 left-4 z-10">
                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                  selectedIds.has(template.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-transparent group-hover:border-slate-300'
                }`}>
                  <Check className="w-3 h-3" />
                </div>
              </div>
              <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 flex gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleDuplicateClick(template)}
                  className="p-2.5 bg-white shadow-lg text-slate-400 hover:text-indigo-600 rounded-xl transition-all border border-slate-100"
                  title="Duplicate"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleSendTest(template)}
                  className="p-2.5 bg-white shadow-lg text-slate-400 hover:text-emerald-600 rounded-xl transition-all border border-slate-100"
                  title="Send Test"
                >
                  <Send className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEditClick(template)}
                  className="p-2.5 bg-white shadow-lg text-slate-400 hover:text-indigo-600 rounded-xl transition-all border border-slate-100"
                  title="Edit"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteClick(template)}
                  className="p-2.5 bg-white shadow-lg text-slate-400 hover:text-red-600 rounded-xl transition-all border border-slate-100"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-4 mb-5">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${
                  template.channel === 'whatsapp' ? 'bg-emerald-50' : 
                  template.channel === 'sms' ? 'bg-blue-50' : 
                  template.channel === 'email' ? 'bg-indigo-50' : 'bg-orange-50'
                }`}>
                  {getTypeIcon(template.channel, "w-6 h-6")}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-slate-900 truncate pr-4 tracking-tight">{template.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                      template.messageType === 'transactional' ? 'bg-indigo-100 text-indigo-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {template.messageType}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 font-mono">{template.channel}</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <p className="text-slate-600 text-sm line-clamp-3 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50 italic">
                  "{template.body}"
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  {template.language.toUpperCase()}
                </span>
                <span>{new Date(template.createdAt?.seconds * 1000).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="enterprise-card overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 w-10">
                  <button 
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0 ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Label / Name</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Content Preview</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTemplates.map((template) => (
                <tr 
                  key={template.id} 
                  onClick={() => toggleSelect(template.id)}
                  className={`hover:bg-slate-50 transition-colors cursor-pointer ${selectedIds.has(template.id) ? 'bg-indigo-50/30' : ''}`}
                >
                  <td className="px-6 py-4">
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      selectedIds.has(template.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-transparent'
                    }`}>
                      <Check className="w-3 h-3" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-8 h-8 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center">
                      {getTypeIcon(template.channel)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900">{template.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{template.messageType}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 truncate max-w-md">{template.body}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => handleSendTest(template)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                        title="Send Test"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicateClick(template)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Duplicate"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditClick(template)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(template)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))] p-4 backdrop-blur-md">
          <div className="w-full max-w-7xl overflow-hidden rounded-[2.2rem] border border-white/20 bg-white shadow-[0_36px_120px_-28px_rgba(15,23,42,0.65)] animate-in fade-in zoom-in duration-300 flex flex-col md:flex-row h-auto max-h-[95vh]">
            
            {/* Left Side: Form (Increased Room) */}
            <div className="flex-[1.25] overflow-y-auto border-r border-slate-100 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/90 px-6 py-5 backdrop-blur-xl sm:px-8">
                <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1">
                      <div className="h-1.5 w-1.5 rounded-full bg-indigo-600"></div>
                      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-indigo-700">ORBI Talk Template Studio</span>
                    </div>
                  <h2 className="text-2xl font-black text-slate-950 tracking-tight">
                    {editingTemplateId ? 'Edit Template' : 'Create Template'}
                  </h2>
                  <p className="text-slate-500 text-xs font-semibold">
                      {editingTemplateId ? 'Safely update sender, delivery rules, and dynamic content.' : 'Build a production-ready message template with approved sender controls.'}
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                    className="p-3 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-2xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
                </div>
              </div>

              <form onSubmit={handleAddTemplate} className="space-y-5 p-6 sm:p-8">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Identity</p>
                      <h3 className="text-sm font-black text-slate-900">Template registry details</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Step 01</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Template Name (ID)</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g., OTP_Message"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-bold font-mono placeholder:text-slate-300 shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Language Code</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g., en"
                      value={newLanguage}
                      onChange={(e) => setNewLanguage(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-bold placeholder:text-slate-300 shadow-sm"
                    />
                  </div>
                </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Delivery Rail</p>
                      <h3 className="text-sm font-black text-slate-900">Choose where this template is delivered</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Step 02</span>
                  </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {(['sms', 'whatsapp', 'email', 'push'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewChannel(type)}
                          className={`group flex min-h-[92px] flex-col items-start justify-between gap-2 rounded-2xl border p-3 text-left transition-all relative overflow-hidden ${
                            newChannel === type 
                              ? 'bg-slate-950 border-slate-950 text-white shadow-xl shadow-slate-200' 
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-indigo-200 hover:shadow-md'
                          }`}
                        >
                          <div className={`p-2 rounded-xl transition-colors ${newChannel === type ? 'bg-white/15' : 'bg-white shadow-sm'}`}>
                            {getTypeIcon(type, "w-4 h-4")}
                          </div>
                          <span className="text-xs font-black">
                            {type === 'sms' ? 'SMS' : type === 'whatsapp' ? 'WhatsApp' : type.charAt(0).toUpperCase() + type.slice(1)}
                          </span>
                          <span className={`text-[9px] font-bold ${newChannel === type ? 'text-white/60' : 'text-slate-400'}`}>
                            {type === 'email' ? 'Resend / SMTP' : type === 'sms' ? 'Device relay' : type === 'whatsapp' ? 'Business channel' : 'Mobile push'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Purpose</p>
                      <h3 className="text-sm font-black text-slate-900">Classify this message</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">Step 03</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewMessageType('transactional')}
                      className={`flex flex-col text-left p-3 rounded-2xl border-2 transition-all ${
                        newMessageType === 'transactional' 
                          ? 'border-indigo-600 bg-indigo-50/50 ring-4 ring-indigo-500/10' 
                          : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${newMessageType === 'transactional' ? 'text-indigo-600' : 'text-slate-500'}`}>Transactional</span>
                        {newMessageType === 'transactional' && <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>}
                      </div>
                      <p className="text-[9px] text-slate-500 leading-tight mb-2">Instant delivery for OTPs, alerts, and critical updates.</p>
                      <div className="bg-white/60 rounded-lg p-1.5 border border-slate-100">
                        <p className="text-[7px] font-mono text-slate-400 italic line-clamp-2 leading-tight">{"\"Ndugu {{senderName}} umefanikiwa kutuma {{currency}} {{amount}}...\""}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMessageType('promotional')}
                      className={`flex flex-col text-left p-3 rounded-2xl border-2 transition-all ${
                        newMessageType === 'promotional' 
                          ? 'border-amber-500 bg-amber-50/50 ring-4 ring-amber-500/10' 
                          : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${newMessageType === 'promotional' ? 'text-amber-600' : 'text-slate-500'}`}>Promotional</span>
                        {newMessageType === 'promotional' && <div className="w-2 h-2 bg-amber-500 rounded-full"></div>}
                      </div>
                      <p className="text-[9px] text-slate-500 leading-tight mb-2">Scheduled delivery for marketing and announcements.</p>
                      <div className="bg-white/60 rounded-lg p-1.5 border border-slate-100">
                        <p className="text-[7px] font-mono text-slate-400 italic line-clamp-2 leading-tight">{"\"Habari {{name}}! Pata punguzo la {{discount}}% unapotumia...\""}</p>
                      </div>
                    </button>
                  </div>
                </div>

                {newChannel === 'email' && (
                  <div className="space-y-4 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-4 shadow-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Email Delivery Identity</p>
                        <h3 className="text-sm font-black text-slate-900">Choose an approved ORBI sender</h3>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
                          This sender is saved on the template and reused whenever ORBI Core calls this template. Staff cannot inject random sender emails at send time.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                        Allow-list enforced
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Subject</label>
                      <input
                        type="text"
                        placeholder="e.g., Your Verification Code"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 transition-all text-sm font-bold placeholder:text-slate-300 shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Allowed Email Senders</label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {emailSenderOptions.map((option) => {
                          const isSelected = newFromEmail === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setNewFromEmail(option.value)}
                              className={`group rounded-2xl border p-3 text-left transition-all ${
                                isSelected
                                  ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-100 ring-4 ring-indigo-500/10'
                                  : 'border-slate-200 bg-white/70 hover:border-indigo-200 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className={`text-xs font-black ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>{option.label}</p>
                                  <p className="mt-0.5 break-all font-mono text-[10px] font-bold text-slate-500">{option.email}</p>
                                </div>
                                <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                                  isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-slate-50 text-transparent'
                                }`}>
                                  <Check className="h-3 w-3" />
                                </div>
                              </div>
                              <p className="mt-2 text-[10px] font-semibold leading-snug text-slate-500">{option.description}</p>
                            </button>
                          );
                        })}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-2">
                        <p className="text-[10px] font-bold leading-relaxed text-slate-500">
                          Selected sender: <span className="font-mono text-slate-800">{newFromEmail}</span>. Replies go to this alias and Cloudflare Email Routing decides the final inbox.
                        </p>
                      </div>
                    </div>
                    </div>
                  </div>
                )}

                  <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex flex-col">
                        <label className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Template Composer</label>
                        <h3 className="text-sm font-black text-slate-900">Write the message payload</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Use {"{{variable}}"} placeholders. ORBI Core supplies real values at send time.</p>
                      </div>
                      <div className="flex max-w-md flex-wrap gap-1.5 justify-start sm:justify-end">
                      {[
                        { label: 'Name', tag: '{{name}}' },
                        { label: 'Date', tag: '{{date}}' },
                        { label: 'Amount', tag: '{{amount}}' },
                        { label: 'Account', tag: '{{account_last4}}' },
                        { label: 'Merchant', tag: '{{merchant}}' },
                        { label: 'ID', tag: '{{tx_id}}' }
                      ].map(v => (
                        <button 
                          key={v.tag}
                          type="button"
                          onClick={() => setNewBody(prev => prev + v.tag)}
                          className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-tighter text-indigo-600 transition-colors hover:bg-indigo-600 hover:text-white"
                        >
                          + {v.tag}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative">
                    <textarea
                      required
                      placeholder={newMessageType === 'transactional' 
                        ? "ORB Financial Technologies:\nNdugu {{senderName}} umefanikiwa kutuma {{currency}} {{amount}}/= kutoka kwenye akaunti yako ya ORBI kwenda kwa {{recipientName}} saa {{timestamp}}. Kumbukumbu {{refId}} . {{footer}}"
                        : "ORB Financial Technologies:\nHabari {{name}}! Pata punguzo la {{discount}}% unapotumia kadi yako ya ORBI leo. Ofa hii ni halali hadi {{expiry}}. Tembelea {{link}} sasa!"
                      }
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      rows={7}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-sm font-semibold leading-relaxed text-slate-100 shadow-inner transition-all placeholder:text-slate-500 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                    />
                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-100 shadow-sm">
                      <span className={`text-[9px] font-black ${newBody.length > 160 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {newBody.length} / 160
                      </span>
                    </div>
                  </div>
                </div>

                <div className="sticky bottom-0 -mx-6 -mb-6 flex gap-3 border-t border-slate-200 bg-white/92 p-4 backdrop-blur-xl sm:-mx-8 sm:-mb-8">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-6 py-3 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all text-[10px] uppercase tracking-widest border border-slate-200"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black transition-all shadow-lg shadow-indigo-200 active:scale-[0.98] text-[10px] uppercase tracking-widest"
                  >
                    {isSubmitting ? "Processing..." : editingTemplateId ? "Update Template" : "Save Template"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Side: Preview Device (Shifted Right) */}
            <div className="hidden md:flex flex-[0.75] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_30%),linear-gradient(180deg,#f8fafc,#eef2ff)] p-8 items-center justify-center relative">
              <button
                onClick={() => setIsModalOpen(false)}
                className="absolute top-6 right-6 p-3 text-slate-400 hover:text-slate-900 hover:bg-white rounded-2xl transition-all shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-full max-w-[260px] space-y-6">
                <div className="text-center">
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.3em]">Live Preview</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{newChannel.toUpperCase()} rendering sandbox</p>
                </div>
                
                {/* Phone Frame */}
                <div className="relative mx-auto border-[8px] border-slate-900 rounded-[3rem] h-[480px] w-full bg-white shadow-[0_40px_80px_-15px_rgba(0,0,0,0.2)] overflow-hidden">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-slate-900 rounded-b-2xl z-20"></div>
                  
                  {/* Screen Content */}
                  <div className="h-full flex flex-col">
                    {/* App Header */}
                    <div className={`p-4 pt-6 border-b flex items-center gap-3 ${newChannel === 'whatsapp' ? 'bg-[#075e54] text-white border-none' : 'bg-white border-slate-100'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${newChannel === 'whatsapp' ? 'bg-white/20' : 'bg-indigo-100'}`}>
                        {getTypeIcon(newChannel, "w-3.5 h-3.5")}
                      </div>
                      <div>
                        <p className={`text-[9px] font-black ${newChannel === 'whatsapp' ? 'text-white' : 'text-slate-900'}`}>
                          {newChannel === 'whatsapp' ? 'ORBI Business' : newChannel === 'email' ? 'ORBI Mailer' : newChannel === 'push' ? 'ORBI Push' : 'ORBI Talk'}
                        </p>
                        <div className="flex items-center gap-1">
                          <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse"></div>
                          <p className={`text-[7px] font-bold ${newChannel === 'whatsapp' ? 'text-emerald-300' : 'text-emerald-500'}`}>Active</p>
                        </div>
                      </div>
                    </div>

                    {/* Messages Area */}
                    <div className={`flex-1 p-4 space-y-4 overflow-y-auto ${newChannel === 'whatsapp' ? 'bg-[#e5ddd5]' : 'bg-slate-50/50'}`}>
                      <div className="flex justify-start">
                        <div className={`max-w-[90%] p-3 rounded-2xl shadow-sm border ${
                          newChannel === 'whatsapp' 
                            ? 'bg-[#dcf8c6] border-[#c7e9b4] rounded-tl-none' 
                            : newChannel === 'email'
                            ? 'bg-white border-slate-200 rounded-lg shadow-md w-full'
                            : newChannel === 'push'
                            ? 'bg-slate-900 text-white border-none rounded-2xl shadow-xl'
                            : 'bg-white border-slate-100 rounded-tl-none'
                        }`}>
                          {newChannel === 'email' && (
                            <div className="mb-2 pb-2 border-b border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Subject: {newSubject || "Template Subject"}</p>
                            </div>
                          )}
                          {newChannel === 'push' && (
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-4 h-4 bg-indigo-500 rounded flex items-center justify-center">
                                <Activity className="w-2.5 h-2.5 text-white" />
                              </div>
                              <p className="text-[9px] font-black uppercase tracking-widest">Notification</p>
                            </div>
                          )}
                          <p className={`text-[10px] leading-relaxed break-words whitespace-pre-wrap ${newChannel === 'email' ? 'text-slate-700' : newChannel === 'push' ? 'text-slate-100' : 'text-slate-800'}`}>
                            {newBody || "Your message preview will appear here as you type..."}
                          </p>
                          <p className={`text-[7px] mt-2 text-right font-bold ${newChannel === 'push' ? 'text-slate-400' : 'text-slate-400'}`}>12:45 PM</p>
                        </div>
                      </div>
                    </div>

                    {/* Input Bar */}
                    <div className={`p-3 border-t bg-white ${newChannel === 'whatsapp' ? 'bg-[#f0f0f0]' : 'border-slate-100'}`}>
                      <div className={`h-7 rounded-full flex items-center px-3 justify-between ${newChannel === 'whatsapp' ? 'bg-white' : 'bg-slate-100'}`}>
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
                        <div className={`w-3.5 h-3.5 rounded-full ${newChannel === 'whatsapp' ? 'bg-[#128c7e]' : 'bg-indigo-600'}`}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Bulk Delete?</h2>
                <p className="text-slate-500 text-sm font-medium">
                  Are you sure you want to delete <span className="text-slate-900 font-bold">{selectedIds.size} templates</span>? This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsBulkDeleteModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-2xl font-black transition-all shadow-lg shadow-red-100 active:scale-[0.98] text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {isBulkDeleting ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Delete Template?</h2>
                <p className="text-slate-500 text-sm font-medium">
                  Are you sure you want to delete <span className="text-slate-900 font-bold">"{templateToDelete?.name}"</span>? This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-100 transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-2xl font-black transition-all shadow-lg shadow-red-100 active:scale-[0.98] text-xs uppercase tracking-widest"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
