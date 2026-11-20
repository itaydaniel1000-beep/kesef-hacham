package com.kesefhacham.quicktextures;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.AbstractSelectionList;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.CommonComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.repository.Pack;
import net.minecraft.server.packs.repository.PackRepository;

/**
 * The menu that opens on a long press: all installed resource packs, each with a checkbox.
 * "Done" saves, "Cancel" / Esc closes without changes.
 */
public final class PackPickerScreen extends Screen {
	private static final Identifier CHECKBOX = Identifier.withDefaultNamespace("widget/checkbox");
	private static final Identifier CHECKBOX_SELECTED = Identifier.withDefaultNamespace("widget/checkbox_selected");
	private static final Identifier CHECKBOX_HIGHLIGHTED = Identifier.withDefaultNamespace("widget/checkbox_highlighted");
	private static final Identifier CHECKBOX_SELECTED_HIGHLIGHTED = Identifier.withDefaultNamespace("widget/checkbox_selected_highlighted");

	private static final int LIST_TOP = 36;
	private static final int ROW_HEIGHT = 26;
	private static final int ICON_SIZE = 20;
	private static final int CHECKBOX_SIZE = 17;

	private final Screen parent;
	/** The list as it was when the menu opened (to know whether something changed). */
	private final List<String> originalChosen;
	/** Were the textures on when the menu opened? */
	private final boolean wasOn;
	/** Packs shown in the list, in the order the PackRepository returns them. */
	private final List<Pack> packs = new ArrayList<>();
	/** What is currently checked. */
	private final Set<String> checked;

	private PackList list;

	public PackPickerScreen(Screen parent) {
		super(Component.translatable("quicktextures.screen.title"));
		this.parent = parent;

		Minecraft client = Minecraft.getInstance();
		PackRepository repository = client.getResourcePackRepository();
		// Rescan the folder, like the game's resource packs screen does.
		repository.reload();

		this.originalChosen = QuickTexturesConfig.getPacks();
		this.wasOn = TextureToggler.isOn(client);
		this.checked = new LinkedHashSet<>(this.originalChosen);

		for (Pack pack : repository.getAvailablePacks()) {
			// Required packs (like vanilla) can't be turned off anyway, so there is no point showing them.
			if (!pack.isRequired()) {
				this.packs.add(pack);
			}
		}
	}

	@Override
	protected void init() {
		int listHeight = Math.max(ROW_HEIGHT, this.height - LIST_TOP - 36);
		this.list = new PackList(this.minecraft, this.width, listHeight, LIST_TOP, ROW_HEIGHT);
		for (Pack pack : this.packs) {
			this.list.addPackEntry(new PackEntry(pack));
		}
		this.addRenderableWidget(this.list);

		int buttonY = this.height - 28;
		this.addRenderableWidget(Button.builder(CommonComponents.GUI_DONE, button -> this.onDone())
				.pos(this.width / 2 - 155, buttonY)
				.size(150, 20)
				.build());
		this.addRenderableWidget(Button.builder(CommonComponents.GUI_CANCEL, button -> this.onClose())
				.pos(this.width / 2 + 5, buttonY)
				.size(150, 20)
				.build());
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
		super.extractRenderState(graphics, mouseX, mouseY, delta);
		graphics.centeredText(this.font, this.title, this.width / 2, 10, 0xFFFFFFFF);
		graphics.centeredText(this.font, Component.translatable("quicktextures.screen.hint"), this.width / 2, 22, 0xFFA0A0A0);
		if (this.packs.isEmpty()) {
			graphics.centeredText(this.font, Component.translatable("quicktextures.screen.empty"), this.width / 2, LIST_TOP + 20, 0xFFFFFF55);
		}
	}

	/** "Done": save the list, and if the textures are on, apply the change right away. */
	private void onDone() {
		List<String> newChosen = new ArrayList<>();
		// First the packs from the list, in the order they appear in the menu.
		for (Pack pack : this.packs) {
			if (this.checked.contains(pack.getId())) {
				newChosen.add(pack.getId());
			}
		}
		// A chosen pack that is missing from the folder right now stays saved (it is skipped quietly
		// when turning on) so that if it comes back it will work again.
		for (String id : this.originalChosen) {
			if (this.checked.contains(id) && !newChosen.contains(id)) {
				newChosen.add(id);
			}
		}

		QuickTexturesConfig.setPacks(newChosen);
		this.minecraft.gui.setScreen(this.parent);

		if (this.wasOn && !newChosen.equals(this.originalChosen)) {
			TextureToggler.reapply(this.minecraft, this.originalChosen, newChosen);
		}
	}

	/** Esc / "Cancel": close without saving. */
	@Override
	public void onClose() {
		this.minecraft.gui.setScreen(this.parent);
	}

	private void toggle(Pack pack) {
		if (!this.checked.remove(pack.getId())) {
			this.checked.add(pack.getId());
		}
	}

	/** Shortens text that doesn't fit the width, adding "...". */
	private String fit(String text, int maxWidth) {
		if (this.font.width(text) <= maxWidth) {
			return text;
		}
		String ellipsis = "...";
		int end = text.length();
		while (end > 0 && this.font.width(text.substring(0, end) + ellipsis) > maxWidth) {
			end--;
		}
		return text.substring(0, end) + ellipsis;
	}

	final class PackList extends AbstractSelectionList<PackEntry> {
		PackList(Minecraft client, int width, int height, int top, int itemHeight) {
			super(client, width, height, top, itemHeight);
		}

		void addPackEntry(PackEntry entry) {
			this.addEntry(entry);
		}

		@Override
		public int getRowWidth() {
			return Math.min(320, PackPickerScreen.this.width - 40);
		}

		@Override
		public void updateWidgetNarration(NarrationElementOutput output) {
		}
	}

	final class PackEntry extends AbstractSelectionList.Entry<PackEntry> {
		private final Pack pack;
		private final boolean incompatible;

		PackEntry(Pack pack) {
			this.pack = pack;
			this.incompatible = !pack.getCompatibility().isCompatible();
		}

		@Override
		public void extractContent(GuiGraphicsExtractor graphics, int mouseX, int mouseY, boolean hovered, float delta) {
			int x = this.getContentX();
			int y = this.getContentY();
			int width = this.getContentWidth();
			int height = this.getContentHeight();

			boolean isChecked = PackPickerScreen.this.checked.contains(this.pack.getId());
			Identifier box = isChecked
					? (hovered ? CHECKBOX_SELECTED_HIGHLIGHTED : CHECKBOX_SELECTED)
					: (hovered ? CHECKBOX_HIGHLIGHTED : CHECKBOX);
			graphics.blitSprite(RenderPipelines.GUI_TEXTURED, box, x, y + (height - CHECKBOX_SIZE) / 2, CHECKBOX_SIZE, CHECKBOX_SIZE);

			int iconX = x + CHECKBOX_SIZE + 6;
			int iconY = y + (height - ICON_SIZE) / 2;
			Identifier icon = PackIcons.get(PackPickerScreen.this.minecraft, this.pack);
			if (icon != null) {
				graphics.blit(RenderPipelines.GUI_TEXTURED, icon, iconX, iconY, 0, 0, ICON_SIZE, ICON_SIZE, ICON_SIZE, ICON_SIZE);
			} else {
				graphics.fill(iconX, iconY, iconX + ICON_SIZE, iconY + ICON_SIZE, 0xFF3A3A3A);
			}

			int textX = iconX + ICON_SIZE + 6;
			int textWidth = Math.max(10, x + width - textX);
			String name = PackPickerScreen.this.fit(this.pack.getTitle().getString(), textWidth);
			if (this.incompatible) {
				graphics.text(PackPickerScreen.this.font, name, textX, y + 1, 0xFFFFFFFF);
				String warning = PackPickerScreen.this.fit(
						"⚠ " + Component.translatable("quicktextures.screen.incompatible").getString(), textWidth);
				graphics.text(PackPickerScreen.this.font, Component.literal(warning).withStyle(ChatFormatting.GOLD),
						textX, y + 12, 0xFFFFAA00, false);
			} else {
				graphics.text(PackPickerScreen.this.font, name, textX, y + (height - 8) / 2, 0xFFFFFFFF);
			}
		}

		@Override
		public boolean mouseClicked(MouseButtonEvent event, boolean doubleClick) {
			PackPickerScreen.this.toggle(this.pack);
			return true;
		}
	}
}
