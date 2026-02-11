import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const grid = document.getElementById('calendario-grid');

// Variáveis Globais para manter a memória
let escalaFixa = null;      // Guarda o rodízio para não mudar quando atualiza o lead
let diasUteisGlobais = [];  // Guarda os dias do mês
let poolCorretores = [];    // Guarda os dados dos corretores

// INICIALIZAÇÃO
window.iniciarPlantao = async () => {
    grid.innerHTML = '<div class="text-center w-100 mt-5"><h4>🔄 Carregando escala e sincronizando leads...</h4></div>';
    
    // 1. Busca Corretores (Uma vez, para montar a base)
    const corretoresSnap = await getDocs(collection(db, "corretores"));
    poolCorretores = [];
    
    corretoresSnap.forEach(d => {
        let dados = d.data();
        // Regra: Só entra na escala se tiver saldo (Meta) > 0
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            poolCorretores.push({ id: d.id, ...dados });
        }
    });

    if (poolCorretores.length < 3) {
        return grid.innerHTML = '<div class="alert alert-warning">É necessário pelo menos 3 corretores com saldo (Meta Distribuída) para gerar a escala.</div>';
    }

    // 2. Gera os dias e a Escala (Rodízio)
    diasUteisGlobais = getDiasUteisMes();
    
    // Se já tivermos uma escala na memória, não gera outra (para não mudar os nomes de lugar)
    if (!escalaFixa) {
        escalaFixa = gerarLogicaRodizio(diasUteisGlobais, poolCorretores);
    }

    // 3. Ativa o "Ouvido" para os Leads (Tempo Real)
    // Toda vez que alguém adicionar/excluir um lead lá na outra tela, aqui roda de novo.
    onSnapshot(collection(db, "leads"), (snapshot) => {
        let todosLeads = [];
        snapshot.forEach(doc => {
            todosLeads.push(doc.data());
        });

        // Atualiza a tela mantendo a escala, só mudando os números
        renderizarCalendario(diasUteisGlobais, escalaFixa, todosLeads);
    });
};

// --- LÓGICA DE RODÍZIO (Sorteio dos dias) ---
function gerarLogicaRodizio(dias, corretores) {
    let escala = {};
    let ultimoPlantao = [];

    dias.forEach(objDia => { 
        let escalados = [];
        let tentativas = 0;
        
        while (escalados.length < 3 && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            
            // Regras para não repetir
            let jaEstaHoje = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            
            // Relaxa a regra se tiver pouca gente
            if (corretores.length < 6) trabalhouOntem = false;

            if (!jaEstaHoje && !trabalhouOntem) {
                escalados.push(cand);
            }
            tentativas++;
        }
        escala[objDia.dataISO] = escalados;
        ultimoPlantao = escalados;
    });
    return escala;
}

// Gera dias úteis do mês atual
function getDiasUteisMes() {
    let date = new Date();
    let month = date.getMonth();
    let days = []; 
    
    date.setDate(1);
    
    while (date.getMonth() === month) {
        let diaSemana = date.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { // Ignora Sábado e Domingo
            let iso = date.toISOString().split('T')[0]; 
            let display = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            days.push({ dataISO: iso, dataFormatada: display });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

// --- RENDERIZAÇÃO (Desenha na tela) ---
function renderizarCalendario(dias, escala, leads) {
    grid.innerHTML = '';
    
    dias.forEach(dia => {
        let isoDate = dia.dataISO; 
        let displayDate = dia.dataFormatada;
        let corretoresDoDia = escala[isoDate] || [];
        
        let htmlCorretores = corretoresDoDia.map(c => {
            
            // FILTRO CRÍTICO: Conta leads deste corretor, neste dia, deste tipo
            let leadsHojePME = leads.filter(l => l.corretor_id === c.id && l.data_entrega === isoDate && l.tipo === 'pme').length;
            let leadsHojePF = leads.filter(l => l.corretor_id === c.id && l.data_entrega === isoDate && l.tipo === 'pf').length;

            // Busca a meta original salva no corretor (Saldo)
            // Precisamos buscar o dado atualizado do corretor caso a meta mude? 
            // Por enquanto usamos o snapshot inicial (c), mas para contadores, usamos os leads.
            
            let totalPME = c.saldo_pme || 0; 
            let faltamPME = totalPME - leadsHojePME; 

            let totalPF = c.saldo_pf || 0;
            let faltamPF = totalPF - leadsHojePF;

            // Cores: Verde se completou, Preto se falta
            let corPME = faltamPME <= 0 ? 'text-success' : 'text-dark';
            let corPF = faltamPF <= 0 ? 'text-success' : 'text-dark';
            
            // Badge visual se completou
            let checkPME = faltamPME <= 0 ? '✅' : '';
            let checkPF = faltamPF <= 0 ? '✅' : '';

            return `
                <div class="corretor-card text-start border-start border-4 border-warning bg-white shadow-sm mb-2 p-2 rounded position-relative">
                    <div class="fw-bold text-uppercase border-bottom pb-1 mb-1 text-truncate">${c.nome.split(' ')[0]}</div>
                    
                    <div style="font-size: 0.75rem; line-height: 1.3;">
                        <span class="badge bg-warning text-dark mb-1" style="width: 35px;">PME</span> 
                        <span class="fw-bold">Entregues: ${leadsHojePME}</span>
                        <div class="text-muted border-top mt-1 pt-1">
                            Faltam: <b class="${corPME} fs-6">${faltamPME}</b> ${checkPME}
                        </div>
                    </div>

                    <div style="font-size: 0.75rem; line-height: 1.3;" class="mt-2 pt-2 border-top">
                        <span class="badge bg-info text-white mb-1" style="width: 35px;">PF</span> 
                        <span class="fw-bold">Entregues: ${leadsHojePF}</span>
                        <div class="text-muted border-top mt-1 pt-1">
                            Faltam: <b class="${corPF} fs-6">${faltamPF}</b> ${checkPF}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Destaca o dia de hoje
        let hojeISO = new Date().toISOString().split('T')[0];
        let bgDia = isoDate === hojeISO ? "bg-warning-subtle border-warning" : "bg-light";

        grid.innerHTML += `
            <div class="col">
                <div class="calendar-day p-2 h-100 border ${bgDia}">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="fw-bold text-secondary">${displayDate}</span>
                        ${isoDate === hojeISO ? '<span class="badge bg-danger">HOJE</span>' : ''}
                    </div>
                    ${htmlCorretores}
                </div>
            </div>
        `;
    });
}

// Botão para forçar recriar escala (Rodízio)
window.gerarEscala = () => {
    if(confirm("ATENÇÃO: Isso vai mudar os corretores de dia! Deseja refazer o sorteio do rodízio?")) {
        escalaFixa = null; // Limpa a memória
        window.iniciarPlantao(); // Recomeça
    }
}

// Inicia
window.iniciarPlantao();
