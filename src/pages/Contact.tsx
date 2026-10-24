import React, { useState } from 'react';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Building2,
  MessageCircle,
} from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';
import { useToast } from '../context/ToastContext';

const ABIDJAN_COMMUNES = [
  'Cocody',
  'Plateau',
  'Marcory',
  'Treichville',
  'Yopougon',
  'Abobo',
  'Adjamé',
  'Koumassi',
  'Port-Bouët',
  'Attécoubé',
  'Bingerville',
  'Anyama',
  'Songon',
];

export const Contact: React.FC = () => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    structureName: '',
    buyerName: '',
    commune: 'Cocody',
    phone: '',
    email: '',
    subject: 'Demande de devis proforma équipements',
    message: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.structureName.trim()) {
      errs.structureName = 'Le nom de la structure de santé est requis.';
    }
    if (!formData.buyerName.trim()) {
      errs.buyerName = 'Le nom du responsable des achats est requis.';
    }
    if (!formData.phone.trim()) {
      errs.phone = 'Le numéro de téléphone est requis (+225).';
    }
    if (!formData.message.trim()) {
      errs.message = 'Veuillez préciser les références ou quantités souhaitées.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      showToast('Veuillez remplir les champs obligatoires.', 'error');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      showToast('Votre demande proforma a été transmise à la cellule commerciale.', 'success');
    }, 600);
  };

  return (
    <PageShell>
      <div className="relative w-full px-4 sm:px-6 pt-28 pb-16">
        <div className="mx-auto w-full max-w-6xl space-y-10">
          {/* Header */}
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2} />
              Service Commercial &amp; Biomédical Abidjan
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mt-3">
              Contacter l’équipe CYM Pharma
            </h1>
            <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
              Besoin d’une facture proforma pour votre comité d’achats, d’un bon d’engagement ou d’une
              livraison cadencée sur plusieurs sites à Abidjan ? Notre cellule B2B vous répond sous 2 heures ouvrées.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: Direct coordinates */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Coordonnées directes en Côte d’Ivoire
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Plateforme B2B pour cliniques, pharmacies et CHU
                  </p>
                </div>

                <div className="space-y-5 text-xs sm:text-sm">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Siège</p>
                      <p className="text-slate-600 mt-0.5 leading-relaxed">
                        Port-bouet centre , cité policière, Abidjan
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Standard Commandes &amp; Devis</p>
                      <p className="text-slate-600 font-mono text-xs mt-0.5">
                        +225 05 94 84 18 18 
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Cellule Proforma &amp; Facturation</p>
                      <p className="text-slate-600 mt-0.5 font-mono text-xs">
                        
                      </p>
                    </div>
                  </div>

                </div>

                <div className="pt-2 border-t border-slate-100">
                  <a
                    href="https://wa.me/2250709554020?text=Bonjour%20CYM%20Pharma,%20je%20souhaite%20une%20cotation%20pour%20mon%20établissement"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
                  >
                    <MessageCircle className="w-4 h-4" strokeWidth={2} />
                    <span>Échanger sur WhatsApp Business (+225 05 94 84 18 18  )</span>
                  </a>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <FileText className="w-4 h-4 text-amber-700 shrink-0" strokeWidth={2} />
                  <span>Proforma conforme &amp; délai garanti</span>
                </div>
                <p className="leading-relaxed">
                  Toutes les devis émis par CYM Pharma incluent les délais fermes de mise à disposition à Abidjan et les fiches techniques certifiées pour votre comité médical.
                </p>
              </div>
            </div>

            {/* Right: Controlled Form */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
              {submitted ? (
                <div className="py-12 text-center space-y-5">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" strokeWidth={2} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Demande transmise au service commercial
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed mt-2">
                      Merci <strong className="text-slate-800">{formData.buyerName}</strong>. Notre cellule biomédicale d’Abidjan traite la demande de l’établissement <strong className="text-slate-800">{formData.structureName}</strong> et vous contacte au <span className="font-mono text-slate-800">{formData.phone}</span>.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitted(false);
                        setFormData((prev) => ({ ...prev, message: '' }));
                      }}
                      className="btn-secondary text-xs"
                    >
                      Envoyer une autre demande
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Formulaire de demande proforma &amp; cotation
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Remplissez les informations de votre structure médicale ci-dessous
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="contact-structure"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Nom de la structure de santé *
                      </label>
                      <div className="relative">
                        <input
                          id="contact-structure"
                          type="text"
                          value={formData.structureName}
                          onChange={(e) => handleChange('structureName', e.target.value)}
                          placeholder="Ex: Polyclinique Les Hibiscus"
                          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                      </div>
                      {errors.structureName && (
                        <p className="text-xs text-rose-600 mt-1">{errors.structureName}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-buyer"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Responsable des achats *
                      </label>
                      <input
                        id="contact-buyer"
                        type="text"
                        value={formData.buyerName}
                        onChange={(e) => handleChange('buyerName', e.target.value)}
                        placeholder="Ex: Kouadio Marc-Antoine"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      {errors.buyerName && (
                        <p className="text-xs text-rose-600 mt-1">{errors.buyerName}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label
                        htmlFor="contact-commune"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Commune (Abidjan)
                      </label>
                      <select
                        id="contact-commune"
                        value={formData.commune}
                        onChange={(e) => handleChange('commune', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        {ABIDJAN_COMMUNES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="contact-phone"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        Téléphone (+225) *
                      </label>
                      <input
                        id="contact-phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleChange('phone', e.target.value)}
                        placeholder="+225 07 09 00 00 00"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      {errors.phone && (
                        <p className="text-xs text-rose-600 mt-1">{errors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block text-xs font-semibold text-slate-700 mb-1"
                      >
                        E-mail professionnel
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        placeholder="achats@etablissement.ci"
                        className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-subject"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Objet de la demande
                    </label>
                    <select
                      id="contact-subject"
                      value={formData.subject}
                      onChange={(e) => handleChange('subject', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      <option value="Demande de devis proforma équipements">
                        Demande de devis proforma équipements
                      </option>
                      <option value="Contrat de réassort mensuel consommables">
                        Contrat de réassort mensuel consommables
                      </option>
                      <option value="Suivi de livraison sur Abidjan">
                        Suivi de livraison sur Abidjan
                      </option>
                      <option value="Maintenance biomédicale & garantie">
                        Maintenance biomédicale &amp; garantie
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Détail de votre besoin (références, quantités, délais) *
                    </label>
                    <textarea
                      id="contact-message"
                      rows={4}
                      value={formData.message}
                      onChange={(e) => handleChange('message', e.target.value)}
                      placeholder="Précisez les équipements (moniteurs, concentrateurs, tensiomètres...) ou consommables nécessaires..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                    />
                    {errors.message && (
                      <p className="text-xs text-rose-600 mt-1">{errors.message}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full flex items-center justify-center gap-2 py-3"
                  >
                    <Send className="w-4 h-4" strokeWidth={2} />
                    <span>{loading ? 'Envoi en cours...' : 'Envoyer la demande au service B2B'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
};
