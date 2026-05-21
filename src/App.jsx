import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  getFirestore, collection, doc, setDoc, getDocs, addDoc, 
  onSnapshot, query, serverTimestamp, deleteDoc 
} from 'firebase/firestore';
import { 
  Users, UserPlus, Camera, ScanFace, CheckCircle2, 
  AlertCircle, ChevronRight, Menu, X, Trash2, CalendarCheck, Shield, Upload, RefreshCw, Download, BarChart3, History
} from 'lucide-react';

// ============================================================================
// CONFIGURAÇÃO E INICIALIZAÇÃO DO FIREBASE
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBImAFyud2uuL2wj4fgJHtYCkABoKPviZI",
  authDomain: "ccmc-app-jiu-jitsu.firebaseapp.com",
  projectId: "ccmc-app-jiu-jitsu",
  storageBucket: "ccmc-app-jiu-jitsu.firebasestorage.app",
  messagingSenderId: "391376795848",
  appId: "1:391376795848:web:29372567c1309b8ded0dfd",  
  measurementId: "G-G2R3CWW95W"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ccmc-jiujitsu-app';

// Auxiliar para obter caminhos de coleção de acordo com as regras de segurança
const getPublicPath = (collectionName) => collection(db, 'artifacts', appId, 'public', 'data', collectionName);

// ============================================================================
// URLS DOS MODELOS DO FACE-API
// ============================================================================
const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

// ============================================================================
// FUNÇÃO AUXILIAR PARA EXPORTAR EXCEL (CSV FORMATADO PARA PORTUGUÊS)
// ============================================================================
function exportToCSV(headers, rows, filename) {
  const csvContent = "\uFEFF" + 
    headers.join(";") + "\n" + 
    rows.map(row => row.map(val => {
      const stringVal = val === null || val === undefined ? "" : String(val);
      if (stringVal.includes(";") || stringVal.includes("\n") || stringVal.includes('"')) {
        return `"${stringVal.replace(/"/g, '""')}"`;
      }
      return stringVal;
    }).join(";")).join("\n");

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Retorna o dia da semana formatado em texto legível
function getPortugueseDayOfWeek(date) {
  const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return days[date.getDay()];
}

// ============================================================================
// COMPONENTE PRINCIPAL DO APP
// ============================================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadingProgress, setModelLoadingProgress] = useState('Iniciando...');
  
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, history, students, attendance
  const [students, setStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estados dos Modais Customizados
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: '', message: '' });

  // Funções controladoras dos Modais
  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm });
  };

  const triggerAlert = (title, message) => {
    setAlertModal({ isOpen: true, title, message });
  };

  // Autenticação & Inicialização
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Erro na autenticação:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsInitializing(false);
    });

    return () => unsubscribe();
  }, []);

  // Carregar Script e Modelos da Face-API
  useEffect(() => {
    const loadFaceApi = async () => {
      try {
        setModelLoadingProgress('Carregando motor de IA...');
        if (!window.faceapi) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        setModelLoadingProgress('Baixando modelo de detecção...');
        await window.faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL);
        
        setModelLoadingProgress('Baixando modelo de mapeamento facial...');
        await window.faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        
        setModelLoadingProgress('Baixando modelo de reconhecimento...');
        await window.faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);

        setModelsLoaded(true);
        setModelLoadingProgress('IA Pronta!');
      } catch (error) {
        console.error("Erro ao carregar Face API:", error);
        setModelLoadingProgress('Erro ao carregar IA. Recarregue a página.');
      }
    };

    loadFaceApi();
  }, []);

  // Escuta ativa de dados do Firebase Firestore
  useEffect(() => {
    if (!user) return;

    const studentsUnsub = onSnapshot(getPublicPath('students'), (snapshot) => {
      const studentData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      studentData.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(studentData);
    }, (error) => console.error("Erro ao buscar alunos:", error));

    const sessionsUnsub = onSnapshot(getPublicPath('sessions'), (snapshot) => {
      const sessionData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sessionData.sort((a, b) => b.timestamp - a.timestamp);
      setSessions(sessionData);
    }, (error) => console.error("Erro ao buscar registros de chamada:", error));

    return () => {
      studentsUnsub();
      sessionsUnsub();
    };
  }, [user]);

  if (isInitializing) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">Carregando Sistema CCMC...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar de Navegação */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 flex items-center justify-between border-b border-gray-800">
            <div className="flex items-center gap-3">
              <Shield className="text-red-500 w-8 h-8" />
              <div>
                <h1 className="text-xl font-bold leading-tight">CCMC</h1>
                <p className="text-xs text-gray-400 font-medium tracking-wider">JIU JITSU</p>
              </div>
            </div>
            <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
          
          <nav className="flex-1 p-4 space-y-2">
            <NavItem icon={BarChart3} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }} />
            <NavItem icon={History} label="Histórico de Aulas" active={activeTab === 'history'} onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} />
            <NavItem icon={Users} label="Alunos" active={activeTab === 'students'} onClick={() => { setActiveTab('students'); setIsMobileMenuOpen(false); }} />
            <NavItem icon={ScanFace} label="Chamada IA" active={activeTab === 'attendance'} onClick={() => { setActiveTab('attendance'); setIsMobileMenuOpen(false); }} />
          </nav>

          <div className="p-4 border-t border-gray-800">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></div>
              <span className="text-gray-400">{modelsLoaded ? 'IA Ativa' : modelLoadingProgress}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Cabeçalho Responsivo Mobile */}
        <header className="md:hidden bg-gray-900 text-white p-4 flex items-center justify-between shadow-md z-40">
          <div className="flex items-center gap-2">
            <Shield className="text-red-500 w-6 h-6" />
            <span className="font-bold text-lg">CCMC Jiu Jitsu</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(true)}>
            <Menu size={24} />
          </button>
        </header>

        {/* Conteúdo Dinâmico com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-100">
          {activeTab === 'dashboard' && <DashboardView students={students} sessions={sessions} />}
          {activeTab === 'history' && <HistoryView students={students} sessions={sessions} triggerConfirm={triggerConfirm} />}
          {activeTab === 'students' && <StudentsView students={students} modelsLoaded={modelsLoaded} triggerConfirm={triggerConfirm} />}
          {activeTab === 'attendance' && <AttendanceView students={students} modelsLoaded={modelsLoaded} triggerAlert={triggerAlert} />}
        </div>
      </main>

      {/* RENDERIZAÇÃO DOS MODAIS CUSTOMIZADOS DA APLICAÇÃO */}
      <ConfirmationModal 
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <AlertModal 
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// ============================================================================
// COMPONENTES AUXILIARES DE INTERFACE
// ============================================================================

function ConfirmationModal({ isOpen, title, message, onConfirm, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-red-100 rounded-full text-red-600 shrink-0">
            <AlertCircle size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 font-medium text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm shadow-sm transition-colors"
          >
            Confirmar Exclusão
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertModal({ isOpen, title, message, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-100 rounded-full text-green-600 shrink-0">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium text-sm shadow-sm transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
        active ? 'bg-red-600 text-white font-medium shadow-md' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );
}

// Card de Estatísticas
function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-1 font-sans">{subtitle}</p>}
      </div>
      <div className="bg-gray-50 p-3 rounded-full">
        {icon}
      </div>
    </div>
  );
}

// ============================================================================
// ABA: DASHBOARD VIEW
// ============================================================================
function DashboardView({ students, sessions }) {
  const registeredFaces = students.filter(s => s.descriptorArray && s.descriptorArray.length > 0).length;
  
  // Cálculo de dados demográficos de Faixas
  const beltDistribution = students.reduce((acc, student) => {
    acc[student.belt] = (acc[student.belt] || 0) + 1;
    return acc;
  }, { 'Branca': 0, 'Azul': 0, 'Roxa': 0, 'Marrom': 0, 'Preta': 0 });

  // Média de presença nas últimas aulas
  const totalPresenceSum = sessions.reduce((sum, s) => sum + (s.presentStudentIds?.length || 0), 0);
  const averageAttendance = sessions.length > 0 ? (totalPresenceSum / sessions.length).toFixed(1) : 0;

  // Calculando presença máxima registrada em uma única aula
  const maxAttendance = sessions.length > 0 ? Math.max(...sessions.map(s => s.presentStudentIds?.length || 0)) : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800 font-sans">Painel de Controle (Dashboard)</h2>
        <p className="text-sm text-gray-500 mt-0.5">Visão estatística de desempenho técnico e frequência do CCMC</p>
      </div>
      
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total de Atletas" value={students.length} subtitle="Alunos cadastrados" icon={<Users className="text-blue-500" size={24} />} />
        <StatCard title="Rostos na IA" value={registeredFaces} subtitle={`${students.length > 0 ? Math.round((registeredFaces/students.length)*100) : 0}% da equipe`} icon={<ScanFace className="text-green-500" size={24} />} />
        <StatCard title="Média Presença/Aula" value={averageAttendance} subtitle="Alunos por classe" icon={<CalendarCheck className="text-purple-500" size={24} />} />
        <StatCard title="Recorde de Aula" value={maxAttendance} subtitle="Mais alunos presentes" icon={<Shield className="text-red-500" size={24} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        {/* Distribuição por Faixas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold mb-4 text-gray-800 font-sans flex items-center gap-2">
            <Shield size={18} className="text-red-600" /> Distribuição de Graduações
          </h3>
          <div className="space-y-3">
            {Object.entries(beltDistribution).map(([belt, count]) => {
              const percentage = students.length > 0 ? Math.round((count / students.length) * 100) : 0;
              return (
                <div key={belt} className="space-y-1">
                  <div className="flex justify-between text-sm font-medium text-gray-700">
                    <span className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full border ${getBeltColorDot(belt)}`}></span>
                      Faixa {belt}
                    </span>
                    <span>{count} {count === 1 ? 'aluno' : 'alunos'} ({percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${getBeltBarColor(belt)}`} 
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Diagnóstico da IA e Ações Rápidas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold mb-3 text-gray-800 font-sans flex items-center gap-2">
              <ScanFace size={18} className="text-blue-600" /> Diagnóstico da Câmera & IA
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              Para o reconhecimento no tatame funcionar com a máxima precisão, certifique-se de que cada aluno tenha sua foto cadastrada sob condições ideais de luz diretamente de frente.
            </p>
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-150">
                <span className="text-gray-700">Status Geral do Banco IA:</span>
                <span className={`font-semibold ${registeredFaces === students.length ? 'text-green-600' : 'text-amber-600'}`}>
                  {registeredFaces} de {students.length} Ativos
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-150">
                <span className="text-gray-700">Alunos Sem Foto (Necessitam Biometria):</span>
                <span className="font-bold text-red-600">
                  {students.length - registeredFaces}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 p-3 bg-red-50 rounded-lg border border-red-150 text-xs text-red-800 flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>
              <strong>Dica de Uso:</strong> Use sempre a câmera traseira do seu celular ao fazer a foto de grupo dos alunos para obter maior resolução e nitidez na leitura dos rostos.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getBeltColorDot(belt) {
  const belts = {
    'Branca': 'bg-white border-gray-300',
    'Azul': 'bg-blue-500 border-blue-600',
    'Roxa': 'bg-purple-500 border-purple-600',
    'Marrom': 'bg-amber-700 border-amber-800',
    'Preta': 'bg-black border-gray-900',
  };
  return belts[belt] || belts['Branca'];
}

function getBeltBarColor(belt) {
  const belts = {
    'Branca': 'bg-gray-400',
    'Azul': 'bg-blue-600',
    'Roxa': 'bg-purple-600',
    'Marrom': 'bg-amber-800',
    'Preta': 'bg-gray-900',
  };
  return belts[belt] || belts['Branca'];
}

// ============================================================================
// ABA: HISTÓRICO DE AULAS
// ============================================================================
function HistoryView({ students, sessions, triggerConfirm }) {

  // Exportar todas as chamadas unificadas em uma planilha mestre (Histórico Completo)
  const exportAllSessions = () => {
    if (sessions.length === 0) return;
    
    const headers = ["Data", "Dia da Semana", "Horário", "Nome do Aluno", "Faixa", "Graus", "Status de Presença"];
    const rows = [];

    sessions.forEach(session => {
      const dateVal = session.dateStr || new Date(session.timestamp).toLocaleDateString('pt-BR');
      const timeVal = session.timeStr || new Date(session.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dayOfWeekVal = session.dayOfWeek || getPortugueseDayOfWeek(new Date(session.timestamp));
      const presentIds = session.presentStudentIds || [];

      students.forEach(student => {
        const isPresent = presentIds.includes(student.id);
        rows.push([
          dateVal,
          dayOfWeekVal,
          timeVal,
          student.name,
          student.belt,
          student.degrees !== undefined ? `${student.degrees}º Grau` : "Sem Grau",
          isPresent ? "Presente" : "Ausente"
        ]);
      });
    });

    exportToCSV(headers, rows, "CCMC_JiuJitsu_Frequencia_Geral.csv");
  };

  // Exportar apenas uma chamada de aula específica
  const exportSingleSession = (session) => {
    const dateVal = session.dateStr || new Date(session.timestamp).toLocaleDateString('pt-BR');
    const dayOfWeekVal = session.dayOfWeek || getPortugueseDayOfWeek(new Date(session.timestamp));
    const timeVal = session.timeStr || new Date(session.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const presentIds = session.presentStudentIds || [];

    const headers = ["Nome do Aluno", "Faixa", "Graus", "Status de Presença", "Data da Aula", "Dia da Semana", "Horário"];
    const rows = students.map(student => {
      const isPresent = presentIds.includes(student.id);
      return [
        student.name,
        student.belt,
        student.degrees !== undefined ? `${student.degrees}º Grau` : "Sem Grau",
        isPresent ? "Presente" : "Ausente",
        dateVal,
        dayOfWeekVal,
        timeVal
      ];
    });

    const safeDateFilename = dateVal.replace(/\//g, "-");
    exportToCSV(headers, rows, `CCMC_Chamada_${safeDateFilename}_${timeVal}.csv`);
  };

  const deleteSession = (id) => {
    triggerConfirm(
      "Excluir Registro de Aula",
      "Deseja realmente excluir permanentemente este registro de aula do CCMC? Esta ação não poderá ser desfeita.",
      async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sessions', id));
        } catch (err) {
          console.error("Erro ao deletar aula:", err);
        }
      }
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b pb-4 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 font-sans">Histórico de Aulas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Registro diário de presença do Clube de Campo de Mogi das Cruzes</p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={exportAllSessions}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm w-full sm:w-auto justify-center"
          >
            <Download size={16} />
            <span>Exportar Histórico Completo (Excel)</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-bold mb-4 text-gray-800 font-sans">Chamadas de Presença Registradas</h3>
        
        {sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CalendarCheck size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-lg font-medium">Nenhuma aula gravada no sistema</p>
            <p className="text-sm mt-1">Vá na aba "Chamada IA" para registrar a primeira frequência.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map(session => {
              const displayDate = session.dateStr || new Date(session.timestamp).toLocaleDateString('pt-BR');
              const displayDay = session.dayOfWeek || getPortugueseDayOfWeek(new Date(session.timestamp));
              const displayTime = session.timeStr || new Date(session.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
              
              return (
                <div key={session.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 hover:bg-gray-50 rounded-lg border border-gray-100 transition-colors gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2.5 rounded-lg text-gray-700">
                      <CalendarCheck size={22} />
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">
                        {displayDate} <span className="text-sm font-normal text-gray-500">({displayDay})</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Horário: <span className="font-semibold text-gray-800">{displayTime}</span> • <span className="text-red-600 font-semibold">{session.presentStudentIds?.length || 0}</span> alunos presentes
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => exportSingleSession(session)}
                      title="Exportar esta chamada para Excel"
                      className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 bg-green-50 hover:bg-green-100 border border-green-200 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Download size={14} />
                      <span>Baixar Planilha</span>
                    </button>
                    <button
                      onClick={() => deleteSession(session.id)}
                      title="Excluir aula"
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg transition-colors border border-transparent hover:border-gray-200"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ABA: DIRETÓRIO DE ALUNOS
// ============================================================================
function StudentsView({ students, modelsLoaded, triggerConfirm }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);

  const openNewStudent = () => {
    setEditingStudent(null);
    setIsModalOpen(true);
  };

  const deleteStudent = (id) => {
    triggerConfirm(
      "Remover Aluno",
      "Deseja realmente remover permanentemente este aluno do diretório? Todos os dados associados, incluindo a assinatura biométrica facial, serão excluídos.",
      async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'students', id));
        } catch (e) {
          console.error("Erro ao deletar", e);
        }
      }
    );
  };

  // Exportar lista geral de alunos para Excel
  const exportStudentsToExcel = () => {
    if (students.length === 0) return;

    const headers = ["Nome Completo", "Faixa", "Graus", "Biometria IA Cadastrada"];
    const rows = students.map(student => [
      student.name,
      student.belt,
      student.degrees !== undefined ? `${student.degrees}º Grau` : "Sem Grau",
      student.descriptorArray ? "Sim" : "Não"
    ]);

    exportToCSV(headers, rows, "CCMC_Lista_de_Alunos.csv");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Diretório de Alunos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Controle de registros e biometria para a IA</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {students.length > 0 && (
            <button
              onClick={exportStudentsToExcel}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm"
            >
              <Download size={16} className="text-green-600" />
              <span>Exportar Alunos (Excel)</span>
            </button>
          )}
          <button 
            onClick={openNewStudent}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm"
          >
            <UserPlus size={18} />
            <span>Novo Aluno</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {students.map(student => (
          <div key={student.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg text-gray-900 leading-tight">{student.name}</h3>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border ${getBeltColor(student.belt)}`}>
                    Faixa {student.belt}
                  </span>
                  {student.degrees && student.degrees > 0 ? (
                    <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800 border border-gray-200">
                      {student.degrees} {student.degrees === 1 ? 'Grau' : 'Graus'}
                    </span>
                  ) : (
                    <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100 italic">
                      Sem Grau
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => deleteStudent(student.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 size={18} />
              </button>
            </div>
            
            <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm">
                {student.descriptorArray ? (
                  <><CheckCircle2 size={16} className="text-green-500" /><span className="text-green-700 font-medium">Rosto Cadastrado</span></>
                ) : (
                  <><AlertCircle size={16} className="text-amber-500" /><span className="text-amber-700 font-medium">Sem biometria</span></>
                )}
              </div>
              <button 
                onClick={() => { setEditingStudent(student); setIsModalOpen(true); }}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                Gerenciar <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))}
        {students.length === 0 && (
          <div className="col-span-full py-12 text-center text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
            <Users size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-lg font-medium">Nenhum aluno cadastrado</p>
            <p className="text-sm mt-1">Clique em "Novo Aluno" para começar.</p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <StudentModal 
          student={editingStudent} 
          onClose={() => setIsModalOpen(false)} 
          modelsLoaded={modelsLoaded}
        />
      )}
    </div>
  );
}

function getBeltColor(belt) {
  const belts = {
    'Branca': 'bg-gray-100 text-gray-800 border-gray-300',
    'Azul': 'bg-blue-100 text-blue-800 border-blue-300',
    'Roxa': 'bg-purple-100 text-purple-800 border-purple-300',
    'Marrom': 'bg-amber-100 text-amber-800 border-amber-300',
    'Preta': 'bg-gray-900 text-white border-gray-800',
  };
  return belts[belt] || belts['Branca'];
}

// Modal de Cadastro/Mapeamento Facial de Aluno
function StudentModal({ student, onClose, modelsLoaded }) {
  const [name, setName] = useState(student?.name || '');
  const [belt, setBelt] = useState(student?.belt || 'Branca');
  const [degrees, setDegrees] = useState(student?.degrees !== undefined ? student.degrees : 0);
  
  // Face capture states
  const [isCapturing, setIsCapturing] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' (frontal) ou 'environment' (traseira)
  const [captureStatus, setCaptureStatus] = useState('');
  const [descriptorArray, setDescriptorArray] = useState(student?.descriptorArray || null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  useEffect(() => {
    return () => stopCamera(); // Limpeza ao desmontar componente
  }, [stopCamera]);

  const startCamera = async (mode = facingMode) => {
    if (!modelsLoaded) return;
    setIsCapturing(true);
    setCaptureStatus('Iniciando câmera...');
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCaptureStatus(`Câmera ${mode === 'user' ? 'Frontal' : 'Traseira'} ativa. Aguarde a detecção...`);
    } catch (err) {
      console.error(err);
      setCaptureStatus('Erro ao acessar a câmera selecionada.');
      setIsCapturing(false);
    }
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  const handleVideoPlay = async () => {
    if (!videoRef.current || !isCapturing) return;

    const detectFace = async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || !isCapturing) return;

      try {
        const detection = await window.faceapi
          .detectSingleFace(videoRef.current)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
          if (canvasRef.current) {
            window.faceapi.matchDimensions(canvasRef.current, displaySize);
            const resizedDetection = window.faceapi.resizeResults(detection, displaySize);
            canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            window.faceapi.draw.drawDetections(canvasRef.current, resizedDetection);
          }

          if (detection.detection.score > 0.8) {
             setCaptureStatus('Rosto detectado com sucesso! Processando biometria...');
            
            const newDescriptor = Array.from(detection.descriptor);
            
            setDescriptorArray(prev => {
              const updated = prev ? [...prev] : [];
              updated.push(newDescriptor);
              return updated.slice(0, 5);
            });

             setTimeout(() => {
               stopCamera();
               setCaptureStatus('Biometria Facial salva temporariamente. Salve o cadastro.');
             }, 1000);
             return;
          }
        } else {
           if (canvasRef.current) {
               canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
           }
        }
      } catch (err) {
        console.error("Erro na detecção:", err);
      }
      
      if (isCapturing) {
        requestAnimationFrame(detectFace);
      }
    };

    detectFace();
  };

const handleSave = async (e) => {
  e.preventDefault();

  if (!name.trim()) {
    alert("Digite o nome do aluno");
    return;
  }

  if (!descriptorArray || descriptorArray.length === 0) {
    alert("Capture o rosto antes de salvar!");
    return;
  }

    const data = {
      name: name.trim(),
      belt,
      degrees: Number(degrees),
      descriptorArray: Array.isArray(descriptorArray)
        ? descriptorArray.map(d => Array.from(d))
        : [],
      updatedAt: Date.now()
    };

    
try {
  if (student?.id) {
    await setDoc(doc(db, 'students', student.id), data, { merge: true });
  } else {
    data.createdAt = Date.now();
    await addDoc(collection(db, 'students'), data);
  }

  console.log("SALVOU NO FIREBASE"); // mantém pra teste

  onClose();
} catch (err) {
  console.error("Erro ao salvar cadastro:", err);
  alert("Erro ao salvar: " + err.message);
}

  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-xl text-gray-800">{student ? 'Editar Aluno' : 'Novo Aluno'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form id="student-form" onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
              <input 
                type="text" required value={name} onChange={e => setName(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                placeholder="Ex: João Silva"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Faixa</label>
                <select 
                  value={belt} onChange={e => setBelt(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                >
                  {['Branca', 'Azul', 'Roxa', 'Marrom', 'Preta'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Graus (Listras)</label>
                <select 
                  value={degrees} onChange={e => setDegrees(Number(e.target.value))}
                  className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                >
                  {[0, 1, 2, 3, 4].map(g => (
                    <option key={g} value={g}>{g === 0 ? 'Sem Grau (Lisa)' : `${g}º Grau`}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Biometria Facial (IA)</label>
              
              {!isCapturing ? (
                <div className="space-y-3">
                  {descriptorArray ? (
                    <div className="bg-green-50 text-green-800 p-3 rounded-lg border border-green-200 flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 size={18} /> Assinatura facial gravada no sistema.
                    </div>
                  ) : (
                    <div className="bg-amber-50 text-amber-800 p-3 rounded-lg border border-amber-200 flex items-start gap-2 text-sm">
                      <AlertCircle size={18} className="shrink-0 mt-0.5" /> 
                      Sem biometria. A IA não conseguirá identificar este aluno nas fotos de turma.
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <button 
                      type="button" 
                      onClick={() => startCamera('user')}
                      disabled={!modelsLoaded}
                      className="flex-1 flex justify-center items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 text-xs"
                    >
                      <Camera size={16} />
                      Usar Frontal (Selfie)
                    </button>
                    <button 
                      type="button" 
                      onClick={() => startCamera('environment')}
                      disabled={!modelsLoaded}
                      className="flex-1 flex justify-center items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 text-xs"
                    >
                      <Camera size={16} />
                      Usar Traseira
                    </button>
                  </div>
                  {!modelsLoaded && <p className="text-xs text-center text-gray-500">Aguarde a IA carregar para usar a câmera.</p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-square md:aspect-video flex items-center justify-center">
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      muted 
                      playsInline
                      onPlay={handleVideoPlay}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
                    
                    {/* Botão flutuante para alternar câmera em tempo real */}
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="absolute bottom-3 right-3 bg-white/90 hover:bg-white text-gray-800 p-2.5 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1 text-xs font-semibold"
                    >
                      <RefreshCw size={16} /> Alternar Câmera
                    </button>
                  </div>
                  <p className="text-sm text-center font-medium text-blue-600 animate-pulse">{captureStatus}</p>
                  <button 
                    type="button" 
                    onClick={stopCamera}
                    className="w-full bg-red-100 hover:bg-red-200 text-red-700 py-2 rounded-lg font-medium transition-colors"
                  >
                    Cancelar Câmera
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
            Cancelar
          </button>
          <button type="submit" form="student-form" className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-sm">
            Salvar Aluno
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ABA: CHAMADA POR IA
// ============================================================================
function AttendanceView({ students, modelsLoaded, triggerAlert }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  
  // Camera ao vivo para foto de grupo
  const [isClassCamOpen, setIsClassCamOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // Padrão traseira para fotos de turma
  const [camError, setCamError] = useState('');
  
  // Resultados da IA
  const [detectedFacesCount, setDetectedFacesCount] = useState(0);
  const [attendanceList, setAttendanceList] = useState([]); // { id, name, belt, degrees, hasBiometrics, present }
  
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const classVideoRef = useRef(null);
  const classStreamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Parar câmera ao vivo
  const stopClassCamera = useCallback(() => {
    if (classStreamRef.current) {
      classStreamRef.current.getTracks().forEach(track => track.stop());
      classStreamRef.current = null;
    }
    setIsClassCamOpen(false);
  }, []);

  useEffect(() => {
    return () => stopClassCamera();
  }, [stopClassCamera]);

  // Capturar foto com câmera do aparelho
  const startClassCamera = async (mode = facingMode) => {
    setIsClassCamOpen(true);
    setCamError('');
    setImageSrc(null);
    setAttendanceList([]);
    setDetectedFacesCount(0);
    try {
      if (classStreamRef.current) {
        classStreamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode } 
      });
      classStreamRef.current = stream;
      if (classVideoRef.current) {
        classVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      setCamError('Não foi possível acessar a câmera selecionada. Verifique as permissões do seu navegador.');
      setIsClassCamOpen(false);
    }
  };

  const toggleClassCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startClassCamera(nextMode);
  };

  const captureLivePhoto = () => {
    if (!classVideoRef.current) return;
    
    const video = classVideoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const dataUrl = canvas.toDataURL('image/png');
    setImageSrc(dataUrl);
    stopClassCamera();
  };

  // Upload direto da galeria
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImageSrc(event.target.result);
        setAttendanceList([]);
        setDetectedFacesCount(0);
        stopClassCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerGallery = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Processar Reconhecimento com IA
  const processAttendance = async () => {
    if (!imageRef.current || !modelsLoaded) return;
    
    setIsProcessing(true);
    setProgressText('1. Procurando rostos na foto da turma...');
    
    try {
      const detections = await window.faceapi
        .detectAllFaces(
          imageRef.current,
          new window.faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 })
        )
        .withFaceLandmarks()
        .withFaceDescriptors();
  
      setDetectedFacesCount(detections.length);
      
      if (detections.length === 0) {
        setProgressText('Nenhum rosto encontrado na foto. Tente tirar a foto mais perto da turma ou em ambiente mais claro.');
        setIsProcessing(false);
        return;
      }

      setProgressText(`2. Buscando assinaturas faciais cadastradas (${students.length})...`);
      
      const labeledDescriptors = students
       .filter(s => Array.isArray(s.descriptorArray))
        .map(s => {
          const descriptors = s.descriptorArray.map(d => new Float32Array(d));
          return new window.faceapi.LabeledFaceDescriptors(s.id, descriptors);
        });

      if (labeledDescriptors.length === 0) {
        setProgressText('Erro: Nenhum aluno possui biometria facial gravada no sistema.');
        setIsProcessing(false);
        return;
      }

      const faceMatcher = new window.faceapi.FaceMatcher(labeledDescriptors, 0.5);
      setProgressText(`3. Cruzando os ${detections.length} rostos detectados com a base de dados do CCMC...`);

      const matchedIds = new Set();
      const resultsForCanvas = [];

      detections.forEach(fd => {
        const bestMatch = faceMatcher.findBestMatch(fd.descriptor);
        resultsForCanvas.push({ detection: fd, match: bestMatch });
        // filtro extra contra falso positivo
        if (bestMatch.label !== 'unknown' && bestMatch.distance < 0.6) {
          matchedIds.add(bestMatch.label);
        }
        }
      });

      // Desenha quadrados e tags sobre o rosto dos alunos detectados
      if (canvasRef.current && imageRef.current) {
        const displaySize = { width: imageRef.current.width, height: imageRef.current.height };
        window.faceapi.matchDimensions(canvasRef.current, displaySize);
        
        resultsForCanvas.forEach(({ detection, match }) => {
          const text = match.label === 'unknown' ? 'Não Identificado' : students.find(s => s.id === match.label)?.name.split(' ')[0] || 'Aluno';
          const color = match.label === 'unknown' ? 'red' : 'green';
          
          const box = detection.detection.box;
          const drawBox = new window.faceapi.draw.DrawBox(box, { label: text, boxColor: color });
          drawBox.draw(canvasRef.current);
        });
      }

      setProgressText('4. Cruzamento efetuado! Montando a chamada...');
      
      const newList = students.map(s => ({
        id: s.id,
        name: s.name,
        belt: s.belt,
        degrees: s.degrees || 0,
        hasBiometrics: !!s.descriptorArray,
        present: matchedIds.has(s.id)
      }));
      
      newList.sort((a, b) => {
        if (a.present === b.present) return a.name.localeCompare(b.name);
        return a.present ? -1 : 1; // Coloca quem está presente no topo da listagem
      });

      setAttendanceList(newList);
      setProgressText('Concluído!');

    } catch (err) {
      console.error(err);
      setProgressText('Erro no processamento de reconhecimento facial.');
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePresence = (id) => {
    setAttendanceList(prev => prev.map(s => s.id === id ? { ...s, present: !s.present } : s));
  };

  // Salvar a chamada no banco de dados Firebase
  const saveSession = async () => {
    const presentIds = attendanceList.filter(s => s.present).map(s => s.id);
    const now = new Date();
    
    try {
      await addDoc(getPublicPath('sessions'), {
        timestamp: now.getTime(),
        dateStr: now.toLocaleDateString('pt-BR'),
        timeStr: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        dayOfWeek: getPortugueseDayOfWeek(now),
        presentStudentIds: presentIds,
        totalStudents: students.length,
        notes: "Chamada via IA CCMC"
      });
      
      // Limpa os estados de chamada após sucesso
      setImageSrc(null);
      setAttendanceList([]);
      setDetectedFacesCount(0);
      triggerAlert("Chamada Salva!", "A chamada de Jiu Jitsu para esta aula foi gravada com sucesso no banco de dados do CCMC.");
    } catch (e) {
      console.error("Erro ao salvar aula:", e);
    }
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-6">
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
      />
      
      {/* Lado Esquerdo: Área de Captura de Mídia e IA */}
      <div className="flex-1 space-y-4">
        <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">Chamada Inteligente (IA)</h2>
        
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <p className="text-gray-600 text-sm">Abra a câmera para fotografar a turma unida no tatame ou anexe uma foto tirada anteriormente.</p>
          
          {/* Menu Inicial de Opções de Captura */}
          {!isClassCamOpen && !imageSrc && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6">
              <button
                onClick={() => startClassCamera('environment')}
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-red-200 hover:border-red-500 rounded-2xl bg-red-55/50 hover:bg-red-50 transition-all text-center gap-3 cursor-pointer group"
              >
                <div className="p-4 bg-red-500 rounded-full text-white shadow-md group-hover:scale-105 transition-transform">
                  <Camera size={32} />
                </div>
                <span className="font-bold text-gray-800">Tirar Foto Agora</span>
                <span className="text-xs text-gray-500">Usar câmera traseira/ambiente para bater foto do tatame</span>
              </button>

              <button
                onClick={triggerGallery}
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-200 hover:border-gray-400 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-all text-center gap-3 cursor-pointer group"
              >
                <div className="p-4 bg-gray-700 rounded-full text-white shadow-md group-hover:scale-105 transition-transform">
                  <Upload size={32} />
                </div>
                <span className="font-bold text-gray-800">Anexar da Galeria</span>
                <span className="text-xs text-gray-500">Escolher uma foto de grupo salva no seu dispositivo</span>
              </button>
            </div>
          )}

          {/* Player da Câmera em Tempo Real para Foto da Classe */}
          {isClassCamOpen && (
            <div className="space-y-4">
              <div className="relative w-full bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center border-2 border-gray-800">
                <video 
                  ref={classVideoRef} 
                  autoPlay 
                  muted 
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full animate-pulse">
                  Câmera {facingMode === 'user' ? 'Frontal' : 'Traseira'} Ativa
                </div>

                {/* Alternar Câmera (Frontal vs Traseira) */}
                <button
                  type="button"
                  onClick={toggleClassCameraFacing}
                  className="absolute bottom-3 right-3 bg-white/95 hover:bg-white text-gray-800 p-2.5 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 text-xs font-bold"
                >
                  <RefreshCw size={16} /> Alternar Câmera
                </button>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={stopClassCamera}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-semibold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={captureLivePhoto}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold shadow-md transition-colors flex justify-center items-center gap-2"
                >
                  <Camera size={20} /> Capturar Foto da Turma
                </button>
              </div>
            </div>
          )}

          {camError && (
            <div className="bg-red-50 text-red-800 p-3 rounded-lg border border-red-200 text-sm">
              {camError}
            </div>
          )}

          {/* Visualizar Foto Capturada e Rodar Reconhecimento Facial */}
          {imageSrc && !isClassCamOpen && (
            <div className="space-y-4">
              <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden border bg-gray-900 shadow-inner">
                <img 
                  ref={imageRef} 
                  src={imageSrc} 
                  alt="Turma" 
                  className="w-full h-auto max-h-[60vh] object-contain mx-auto"
                  crossOrigin="anonymous"
                />
                <canvas 
                  ref={canvasRef} 
                  className="absolute top-0 left-0 w-full h-full pointer-events-none" 
                />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => startClassCamera('environment')}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5 text-sm"
                    disabled={isProcessing}
                  >
                    <Camera size={16} /> Nova Câmera
                  </button>
                  <button 
                    onClick={triggerGallery}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5 text-sm"
                    disabled={isProcessing}
                  >
                    <Upload size={16} /> Nova Galeria
                  </button>
                </div>

                <button 
                  onClick={processAttendance}
                  disabled={isProcessing || !modelsLoaded || attendanceList.length > 0}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white py-2.5 rounded-lg font-medium shadow-md transition-all flex justify-center items-center gap-2"
                >
                  {isProcessing ? (
                    <><span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span> Analisando Rostos...</>
                  ) : attendanceList.length > 0 ? (
                    <><CheckCircle2 size={18} /> Reconhecimento Finalizado</>
                  ) : (
                    <><ScanFace size={18} /> Iniciar Reconhecimento IA</>
                  )}
                </button>
              </div>
              
              {isProcessing && <p className="text-sm font-medium text-blue-600 text-center animate-pulse">{progressText}</p>}
              {!isProcessing && attendanceList.length > 0 && (
                <p className="text-sm font-medium text-green-600 text-center">
                  IA detectou {detectedFacesCount} rostos e identificou {attendanceList.filter(s=>s.present).length} alunos cadastrados.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lado Direito: Lista Dinâmica de Chamada com Status de Presença */}
      <div className="w-full lg:w-96 flex flex-col">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[calc(100vh-140px)]">
          <div className="p-4 border-b bg-gray-50 rounded-t-xl flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Lista de Chamada</h3>
            <span className="text-xs font-semibold bg-red-100 text-red-800 px-2.5 py-1 rounded-full">
              {attendanceList.filter(a => a.present).length} Presentes
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {attendanceList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-6 text-center">
                <Users size={32} className="mb-2 opacity-50 text-gray-300" />
                <p className="text-sm font-medium">Aguardando chamada</p>
                <p className="text-xs mt-2 text-gray-500 font-sans">Abra a câmera ou anexe da galeria e execute a IA para cruzar os dados. Ajustes manuais podem ser feitos clicando sobre os nomes.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {attendanceList.map(student => (
                  <button 
                    key={student.id}
                    onClick={() => togglePresence(student.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                      student.present 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-white border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        student.present ? 'bg-green-500 border-green-500' : 'border-gray-300'
                      }`}>
                        {student.present && <CheckCircle2 size={14} className="text-white" />}
                      </div>
                      <div className="text-left">
                        <p className={`font-semibold text-sm ${student.present ? 'text-green-900' : 'text-gray-700'}`}>
                          {student.name}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] text-gray-500 font-medium">
                            Faixa {student.belt} {student.degrees > 0 ? `• ${student.degrees}º Grau` : ''}
                          </span>
                        </div>
                        {!student.hasBiometrics && (
                          <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle size={10} /> Sem biometria cadastrada
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {attendanceList.length > 0 && (
            <div className="p-4 border-t bg-gray-50 rounded-b-xl">
              <button 
                onClick={saveSession}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-md transition-colors"
              >
                Salvar Aula no Banco
              </button>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
