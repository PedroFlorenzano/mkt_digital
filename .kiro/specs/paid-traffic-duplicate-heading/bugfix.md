# Bugfix Requirements Document

## Introduction

Na seção de Tráfego Pago da plataforma, o título "Análise Estratégica" aparece duplicado na tela. Isso ocorre porque o título é renderizado em dois lugares distintos: uma vez em `paid-traffic/page.tsx` dentro da `<section id="strategic">`, e novamente dentro do próprio componente `<StrategicDashboard />`, no seu header row interno. O resultado é que o usuário vê o mesmo título duas vezes seguidas, o que prejudica a apresentação visual da página.

## Bug Analysis

### Current Behavior (Defect)

1.1 QUANDO o usuário acessa a página de Tráfego Pago (`/paid-traffic`) ENTÃO o sistema exibe o título "Análise Estratégica" duas vezes seguidas na mesma seção — uma vez renderizado por `page.tsx` e outra pelo componente `StrategicDashboard`

1.2 QUANDO o componente `StrategicDashboard` é renderizado dentro da `<section id="strategic">` de `page.tsx` ENTÃO o sistema sobrepõe o `<h2>` do componente ao `<h2>` já presente na `<div className="mb-5">` da página, causando duplicação visual

### Expected Behavior (Correct)

2.1 QUANDO o usuário acessa a página de Tráfego Pago ENTÃO o sistema SHALL exibir o título "Análise Estratégica" apenas uma vez na seção correspondente

2.2 QUANDO o componente `StrategicDashboard` é renderizado ENTÃO o sistema SHALL preservar a descrição da seção (texto explicativo em `page.tsx`) e o botão "Gerar diagnóstico" (interno ao componente) corretamente posicionados e visíveis, sem duplicar o título

### Unchanged Behavior (Regression Prevention)

3.1 QUANDO o usuário acessa a página de Tráfego Pago ENTÃO o sistema SHALL CONTINUE TO exibir a lista de campanhas, as ferramentas de otimização e o fluxo explicativo de passos sem alterações

3.2 QUANDO o componente `StrategicDashboard` é exibido ENTÃO o sistema SHALL CONTINUE TO apresentar o botão "Gerar diagnóstico", os resultados de diagnóstico (pontos fortes, alertas, mudanças de rota) e todas as interações existentes de forma funcional

3.3 QUANDO o usuário navega pela página de Tráfego Pago ENTÃO o sistema SHALL CONTINUE TO exibir o texto descritivo da seção Análise Estratégica (parágrafo explicativo sobre diagnóstico dos últimos 30 dias) visivelmente na página
