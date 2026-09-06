\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sn-jnl}[2026/09/06 v1.0 Springer Nature Journal Class Compatibility Wrapper]

\DeclareOption*{\PassOptionsToClass{\CurrentOption}{article}}
\ProcessOptions\relax

\LoadClass[10pt,a4paper]{article}

\RequirePackage{geometry}
\geometry{margin=1in}
\RequirePackage{amsmath,amssymb,amsfonts}
\RequirePackage{graphicx}
\RequirePackage{hyperref}

% Springer Nature Author & Affiliation Macros
\newcommand{\fnm}[1]{#1}
\newcommand{\sur}[1]{#1}
\newcommand{\email}[1]{\footnote{Email: #1}}

\newcommand{\orgdiv}[1]{#1}
\newcommand{\orgname}[1]{#1}
\newcommand{\orgaddress}[1]{#1}
\newcommand{\city}[1]{#1}
\newcommand{\postcode}[1]{#1}
\newcommand{\state}[1]{#1}
\newcommand{\country}[1]{#1}

\providecommand{\affil}[2][]{%
  \par\vspace{2pt}{\small\textit{#2}}\par
}

\renewcommand{\abstract}[1]{%
  \par\vspace{10pt}\noindent\textbf{Abstract}\\[4pt]
  {\small #1}\par\vspace{10pt}
}

\newcommand{\keywords}[1]{%
  \noindent\textbf{Keywords:} #1\par\vspace{10pt}
}

\newcommand{\botrule}{\hline}
\newcommand{\jnl}[1]{#1}

\endinput
