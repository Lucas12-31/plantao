import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const grid = document.getElementById('calendario-grid');

window.montarEscala = async () => {
    grid.innerHTML = '<div class="text-center w-100 mt-5">Carregando corretores e leads...</div>';
    
    // 1. Buscar TUDO que precisamos (Corretores e Leads)
    const [corretoresSnap, leadsSnap] = await Promise.all([
        getDocs(collection(db, "corretores")),
        getDocs(collection(db, "leads"))
    ]);

    // Processa Corretores
    let poolCorretores = [];
    corretoresSnap.forEach(d => {
        let dados = d.data();
        // Entra na escala se tiver saldo > 0 em PME ou PF
        if (dados.saldo_pme > 0 || dados.saldo_pf > 0) {
            poolCorretores.push({ id: d.id, ...dados });
        }
    });

    // Processa Leads (Cria um array simples para filtrarmos depois)
    let todosLeads = [];
    leadsSnap.forEach(d => {
        todosLeads.push(d.data());
    });

    if (poolCorretores.length < 3) {
        return alert("Necessário pelo menos 3 corretores com saldo para gerar escala.");
    }

    // 2. Gerar Dias e Rodízio
    let diasUteis = getDiasUteisMes();
    let escalaFinal = gerarLogicaRodizio(diasUteis, poolCorretores);

    // 3. Renderizar com a Contagem de Leads
    renderizarCalendario(diasUteis, escalaFinal, todosLeads);
};

// --- LÓGICA DE RODÍZIO (Igual anterior) ---
function gerarLogicaRodizio(dias, corretores) {
    let escala = {};
    let ultimoPlantao = [];

    dias.forEach(objDia => { // objDia = { dataFormatada: "DD/MM", dataISO: "YYYY-MM-DD" }
        let escalados = [];
        let tentativas = 0;
        
        while (escalados.length < 3 && tentativas < 100) {
            let cand = corretores[Math.floor(Math.random() * corretores.length)];
            let jaEsta = escalados.some(c => c.id === cand.id);
            let trabalhouOntem = ultimoPlantao.some(c => c.id === cand.id);
            
            if (corretores.length < 6) trabalhouOntem = false;

            if (!jaEsta && !trabalhouOntem) {
                escalados.push(cand);
            }
            tentativas++;
        }
        escala[objDia.dataISO] = escalados;
        ultimoPlantao = escalados;
    });
    return escala;
}

function getDiasUteisMes() {
    let date = new Date();
    let month = date.getMonth();
    let year = date.getFullYear();
    let days = []; // Array de objetos { dataISO, dataFormatada }
    
    date.setDate(1);
    
    while (date.getMonth() === month) {
        let diaSemana = date.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) {
            // Cria formato YYYY-MM-DD para comparar com o banco de dados
            let iso = date.toISOString().split('T')[0]; 
            // Cria formato DD/MM para exibir na tela
            let display = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            days.push({ dataISO: iso, dataFormatada: display });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

// --- RENDERIZAÇÃO COM CÁLCULO DE LEADS ---
function renderizarCalendario(dias, escala, leads) {
    grid.innerHTML = '';
    
    dias.forEach(dia => {
        let isoDate = dia.dataISO; // "2026-02-10"
        let displayDate = dia.dataFormatada; // "10/02"
        let corretoresDoDia = escala[isoDate] || [];
        
        let htmlCorretores = corretoresDoDia.map(c => {
            
            // FILTRAR LEADS DESTE CORRETOR NESTE DIA
            let leadsHojePME = leads.filter(l => l.corretor_id === c.id && l.data_entrega === isoDate && l.tipo === 'pme').length;
            let leadsHojePF = leads.filter(l => l.corretor_id === c.id && l.data_entrega === isoDate && l.tipo === 'pf').length;

            // CÁLCULOS
            let totalPME = c.saldo_pme || 0; // Meta total do mês
            let faltamPME = totalPME - leadsHojePME; // O que resta entregar? (Pode ser negativo se entregou a mais)

            let totalPF = c.saldo_pf || 0;
            let faltamPF = totalPF - leadsHojePF;

            // Estilização se "estourou" a meta ou se ainda falta
            let corPME = faltamPME < 0 ? 'text-success' : 'text-dark';
            let corPF = faltamPF < 0 ? 'text-success' : 'text-dark';

            return `
                <div class="corretor-card text-start border-start border-4 border-warning bg-white shadow-sm mb-2 p-2 rounded">
                    <div class="fw-bold text-uppercase border-bottom pb-1 mb-1">${c.nome.split(' ')[0]}</div>
                    
                    <div style="font-size: 0.75rem; line-height: 1.2;">
                        <span class="badge bg-warning text-dark mb-1">PME</span> 
                        <span class="fw-bold">Dist: ${leadsHojePME}</span>
                        <span class="text-muted ms-1">| Faltam: <b class="${corPME}">${faltamPME}</b></span>
                    </div>

                    <div style="font-size: 0.75rem; line-height: 1.2;" class="mt-1">
                        <span class="badge bg-info text-white mb-1" style="min-width: 36px">PF</span> 
                        <span class="fw-bold">Dist: ${leadsHojePF}</span>
                        <span class="text-muted ms-1">| Faltam: <b class="${corPF}">${faltamPF}</b></span>
                    </div>
                </div>
            `;
        }).join('');

        grid.innerHTML += `
            <div class="col">
                <div class="calendar-day p-2 h-100 border bg-light">
                    <div class="text-end fw-bold text-secondary mb-2">${displayDate}</div>
                    ${htmlCorretores}
                </div>
            </div>
        `;
    });
}

window.montarEscala();
