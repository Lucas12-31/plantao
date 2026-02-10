import { db } from "./firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.executarLogica = async () => {
    
    // 1. Pegar inputs da tela (Estoque de Leads)
    let totalPME = parseInt(document.getElementById('leads-pme-total').value) || 0;
    let totalPF = parseInt(document.getElementById('leads-pf-total').value) || 0;
    
    // 2. Pegar corretores do Firebase
    const querySnapshot = await getDocs(collection(db, "corretores"));
    let corretores = [];
    
    querySnapshot.forEach((doc) => {
        let dados = doc.data();
        let prodPME = parseFloat(dados.producao_pme) || 0;
        let prodPF = parseFloat(dados.producao_pf) || 0;
        
        // CÁLCULOS
        // Meta Financeira: Soma dos valores reais (R$)
        let totalFinanceiro = prodPME + prodPF; 
        
        // Pontuação de Ranking: PME vale DOBRO (Peso 2)
        // Usaremos essa pontuação para definir a proporção dos Leads PF
        let totalPontos = (prodPME * 2) + prodPF;

        // Define se é "PME Ativo" (se vendeu qualquer coisa de PME)
        let isPmeAtivo = prodPME > 0;

        corretores.push({ 
            id: doc.id, 
            ...dados,
            totalFinanceiro: totalFinanceiro,
            totalPontos: totalPontos,
            isPmeAtivo: isPmeAtivo
        });
    });

    // 3. FILTRO DE ELEGIBILIDADE
    // Regra: Tem que bater R$ 3.000 em dinheiro (soma simples)
    let elegiveis = corretores.filter(c => c.totalFinanceiro >= 3000);
    
    // Ordena pelo maior pontuador (para a tabela ficar bonita)
    elegiveis.sort((a, b) => b.totalPontos - a.totalPontos);

    if (elegiveis.length === 0) {
        alert("Nenhum corretor atingiu a meta mínima de R$ 3.000.");
        renderizarTabela([], corretores);
        return;
    }

    // Limpa contadores
    elegiveis.forEach(c => {
        c.temp_leadsPME = 0;
        c.temp_leadsPF = 0;
        c.temp_motivo = "";
    });

    // --- FASE 1: BÔNUS PROGRESSIVO (Leads PME) ---
    // Regra: A cada R$ 2.000 acima da meta, ganha 1 PME
    elegiveis.forEach(c => {
        let excedente = c.totalFinanceiro - 3000;
        if (excedente >= 2000) {
            let bonusPME = Math.floor(excedente / 2000);
            
            if (totalPME >= bonusPME) {
                c.temp_leadsPME += bonusPME;
                totalPME -= bonusPME;
                if(bonusPME > 0) c.temp_motivo += `🎯 +${bonusPME} (Meta). `;
            } else if (totalPME > 0) {
                // Se acabar o estoque no meio do caminho
                c.temp_leadsPME += totalPME;
                totalPME = 0;
            }
        }
    });

    // --- FASE 2: PESO 2 / PME ATIVO (Leads PME Restantes) ---
    // Distribui o que sobrou de PME para quem vendeu PME
    let corretoresPME = elegiveis.filter(c => c.isPmeAtivo);
    
    if (corretoresPME.length > 0 && totalPME > 0) {
        let pmePorCabeca = Math.floor(totalPME / corretoresPME.length);
        if (pmePorCabeca > 0) {
            corretoresPME.forEach(c => {
                c.temp_leadsPME += pmePorCabeca;
                c.temp_motivo += `⭐ +${pmePorCabeca} (Peso 2). `;
            });
            totalPME -= (pmePorCabeca * corretoresPME.length);
        }
    }

    // --- FASE 3: DISTRIBUIÇÃO PF PROPORCIONAL (MUDANÇA AQUI) ---
    // Agora a distribuição é baseada na "Fatia" de pontos que o corretor tem.
    
    if (elegiveis.length > 0 && totalPF > 0) {
        // 1. Somar a pontuação de todos os elegíveis
        let somaPontosGeral = elegiveis.reduce((acc, curr) => acc + curr.totalPontos, 0);
        
        // Guardamos o total original para o cálculo
        let leadsPfParaDistribuir = totalPF;
        
        if (somaPontosGeral > 0) {
            elegiveis.forEach(c => {
                // Calcula a porcentagem do corretor (Ex: 0.65 se tiver 65% dos pontos)
                let share = c.totalPontos / somaPontosGeral;
                
                // Calcula quantidade de leads (arredondando para baixo)
                let leadsDoCorretor = Math.floor(leadsPfParaDistribuir * share);
                
                c.temp_leadsPF += leadsDoCorretor;
                totalPF -= leadsDoCorretor; // Remove do estoque global
            });
        } else {
            // Caso raro: Todos elegíveis tem 0 pontos (impossível pois a meta é 3k, mas por segurança)
            // Divide igualitário se acontecer
            let divisao = Math.floor(totalPF / elegiveis.length);
            elegiveis.forEach(c => { c.temp_leadsPF += divisao; totalPF -= divisao; });
        }
    }

    // Renderiza
    renderizarTabela(elegiveis, corretores);
    mostrarSobras(totalPME, totalPF);
};

function renderizarTabela(elegiveis, todos) {
    const tbody = document.getElementById('tabela-resultado');
    tbody.innerHTML = '';
    const idsElegiveis = elegiveis.map(c => c.id);

    // Formatadores
    const fmtMoney = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtPontos = v => Math.floor(v).toLocaleString('pt-BR');

    elegiveis.forEach(c => {
        let destaque = c.isPmeAtivo ? "table-warning" : "table-success";
        let icone = c.isPmeAtivo ? "⭐" : "";
        
        tbody.innerHTML += `
            <tr class="${destaque}">
                <td>${c.nome} ${icone}</td>
                <td><span class="badge bg-success">Apto</span></td>
                <td>
                    <div class="fw-bold">${fmtMoney(c.totalFinanceiro)}</div>
                    <small class="text-muted" style="font-size: 0.8em">(${fmtPontos(c.totalPontos)} pts)</small>
                </td>
                <td class="fw-bold fs-5">${c.temp_leadsPME} <br><small class="text-muted fw-normal fs-6">${c.temp_motivo}</small></td>
                <td class="fw-bold fs-5">${c.temp_leadsPF}</td>
            </tr>`;
    });

    todos.forEach(c => {
        if (!idsElegiveis.includes(c.id)) {
            tbody.innerHTML += `
                <tr class="table-light text-muted opacity-75">
                    <td>${c.nome}</td>
                    <td><span class="badge bg-danger">Inapto</span></td>
                    <td>${fmtMoney(c.totalFinanceiro)}</td>
                    <td>-</td><td>-</td>
                </tr>`;
        }
    });
}

function mostrarSobras(pme, pf) {
    const div = document.getElementById('alert-sobras');
    if (pme > 0 || pf > 0) {
        div.classList.remove('d-none');
        div.innerHTML = `
            <strong>🚨 SOBRAS (GESTÃO):</strong> 
            Ficaram <b>${pme} Leads PME</b> e <b>${pf} Leads PF</b> sem dono. 
            <br>A supervisora deve distribuir manualmente por meritocracia.
        `;
    } else {
        div.classList.add('d-none');
    }
}
