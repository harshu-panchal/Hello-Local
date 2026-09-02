import { createContext, useContext, useState, ReactNode } from 'react';
import { getTheme, Theme } from '../utils/themes';

interface ThemeContextType {
    activeCategory: string;
    activeTheme: string;
    setActiveCategory: (category: string, themeKey?: string) => void;
    currentTheme: Theme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [activeCategory, setActiveCategoryState] = useState('all');
    const [activeTheme, setActiveThemeState] = useState('all');

    const setActiveCategory = (category: string, themeKey?: string) => {
        setActiveCategoryState(category);
        if (themeKey) {
            setActiveThemeState(themeKey);
        } else {
            setActiveThemeState(category);
        }
    };

    const currentTheme = getTheme(activeTheme || activeCategory);

    return (
        <ThemeContext.Provider value={{ activeCategory, activeTheme, setActiveCategory, currentTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useThemeContext() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useThemeContext must be used within a ThemeProvider');
    }
    return context;
}
