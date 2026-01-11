import React, { useState } from 'react';
import RandomGenerator from './RandomGenerator';
import WordArranger from './WordArranger';

export default function App() {
    const [currentApp, setCurrentApp] = useState('random'); // 'random' or 'word'

    return (
        <>
            {currentApp === 'random' ? (
                <RandomGenerator onSwitchApp={() => setCurrentApp('word')} />
            ) : (
                <WordArranger onSwitchApp={() => setCurrentApp('random')} />
            )}
        </>
    );
}
