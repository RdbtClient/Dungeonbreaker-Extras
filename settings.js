import {
    @ButtonProperty,
    @CheckboxProperty,
    Color,
    @ColorProperty,
    @PercentSliderProperty,
    @SelectorProperty,
    @SwitchProperty,
    @TextProperty,
    @Vigilant,
} from 'Vigilance';

// The only parameter that is required is the first, which should be the Module name.
// The other 2 parameters are optional.
// The 2nd parameter is the title of the settings window, seen in the top left above the
// category list.
// The 3rd parameter is an object that determines the sorting order of the categories.

@Vigilant('DungeonBreakerExtras', 'Advanced Settings', {
    getCategoryComparator: () => (a, b) => {
        const categories = ['Visuals', 'Nuker', "Extras"];
        return categories.indexOf(a.name) - categories.indexOf(b.name);
    },
    getSubcategoryComparator: () => (a, b) => {
        const subcategories = ["Render", "Nuker", "Dungeonbreaker"];
        return subcategories.indexOf(a.getValue()[0].attributesExt.subcategory) - subcategories.indexOf(b.getValue()[0].attributesExt.subcategory);
    },
    getPropertyComparator: () => (a, b) => {
        const names = ["Enable Visuals", "Color Picker", "Enable Nuker", "Pingless", "Global Pingless"];
        return names.indexOf(a.attributesExt.name) - names.indexOf(b.attributesExt.name);
    }
})
class Settings {
    @SwitchProperty({
        name: 'Enable Visuals',
        description: 'Renders filled box on config blocks',
        category: 'Visuals',
        subcategory: 'Render',
        placeholder: 'Activate',
    })
    enabledVisuals = true;

    @ColorProperty({
        name: 'Color Picker',
        description: 'Pick a color for config blocks',
        category: 'Visuals',
        subcategory: 'Render',
    })
    color = Color.BLUE;

    @SwitchProperty({
        name: 'Enable Nuker',
        description: 'Automatically breaks config blocks',
        category: 'Nuker',
        subcategory: 'Nuker',
        placeholder: 'Activate',
    })
    enabledNuker = true;

    @SwitchProperty({
        name: 'Pingless',
        description: 'Instantly removes config blocks clientside',
        category: 'Nuker',
        subcategory: 'Nuker',
        placeholder: 'Activate',
    })
    pingless = true;

    @SwitchProperty({
        name: 'Global Pingless',
        description: 'Instantly removes all blocks mined with dungeonbreaker clientside. (for blocks that can not be instamined eg. wood/obsidian)',
        category: 'Extras',
        subcategory: 'Dungeonbreaker',
        placeholder: 'Activate',
    })
    globalPingless = false;

    constructor() {
        this.initialize(this);

        this.setCategoryDescription('Nuker', 'All available nuker settings should be watchdog safe unless specified.');
    }
}

export default new Settings();
